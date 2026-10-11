import io
import re
from pathlib import PurePath
from urllib.parse import quote, urlsplit
from uuid import uuid4

import httpx
from django.conf import settings
from django.core import signing
from django.db import transaction

from apps.core.exceptions import DomainError
from apps.core.services import audit

from .models import MediaAsset

SALT = "eightytwenty.media-upload"
BRAND = "EightyTwenty"


def brand_alt(label):
    """Alt text in the house style: "Housemade Sourdough – EightyTwenty"."""
    label = (label or "").strip()
    return f"{label} – {BRAND}"[:240] if label else BRAND


def label_from_filename(name):
    """ "karma-cola-01.webp" -> "Karma cola"."""
    words = re.sub(r"[-_\s]+", " ", re.sub(r"[-_ ]*\d*$", "", PurePath(name or "").stem)).strip()
    return words[:1].upper() + words[1:]


def storage_headers():
    if (
        not settings.SUPABASE_URL
        or not settings.SUPABASE_SERVICE_ROLE_KEY
        or not settings.SUPABASE_PUBLIC_MEDIA_BASE
    ):
        raise DomainError("storage_unavailable", "Media storage is not configured.", 503)
    return {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    }


def create_upload_urls(data, request):
    headers = storage_headers()
    prefix = f"{data['folder']}/{uuid4().hex}-{data['content_hash'][:16]}"
    paths = {
        size: f"{prefix}/{width}.webp"
        for size, width in [("thumb", 400), ("md", 800), ("lg", 1600)]
    }
    variants = {}
    try:
        with httpx.Client(timeout=5) as client:
            for size, path in paths.items():
                response = client.post(
                    f"{settings.SUPABASE_URL}/storage/v1/object/upload/sign/{quote(settings.SUPABASE_STORAGE_BUCKET)}/{path}",
                    headers={**headers, "x-upsert": "false"},
                    json={},
                )
                response.raise_for_status()
                url = response.json()["url"]
                if url.startswith("/"):
                    url = (
                        settings.SUPABASE_URL
                        + ("" if url.startswith("/storage/v1/") else "/storage/v1")
                        + url
                    )
                if (
                    urlsplit(url).netloc != urlsplit(settings.SUPABASE_URL).netloc
                    or urlsplit(url).scheme != "https"
                ):
                    raise ValueError("Invalid storage URL")
                variants[size] = {
                    "path": path,
                    "upload_url": url,
                    "public_url": f"{settings.SUPABASE_PUBLIC_MEDIA_BASE}/{path}",
                }
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise DomainError("storage_unavailable", "Could not create upload URLs.", 503) from exc
    receipt = signing.dumps({"actor": str(request.user.pk), "paths": paths}, salt=SALT)
    # Audit contains only paths, never signed URLs or tokens.
    audit(request, request.user, action="media_upload_url", after={"paths": paths})
    return {"receipt": receipt, "expires_in": 7200, "variants": variants}


def register_asset(serializer, request):
    data = dict(serializer.validated_data)
    receipt = data.pop("upload_receipt")
    try:
        manifest = signing.loads(receipt, salt=SALT, max_age=7200)
    except signing.BadSignature as exc:
        raise DomainError("invalid_upload", "The upload receipt is invalid or expired.") from exc
    if manifest["actor"] != str(request.user.pk):
        raise DomainError("permission_denied", "The receipt belongs to another user.", 403)
    paths = manifest["paths"]
    headers = storage_headers()
    total = 0
    try:
        with httpx.Client(timeout=5) as client:
            for path in paths.values():
                response = client.head(
                    f"{settings.SUPABASE_URL}/storage/v1/object/authenticated/{quote(settings.SUPABASE_STORAGE_BUCKET)}/{path}",
                    headers=headers,
                )
                response.raise_for_status()
                size = int(response.headers["content-length"])
                if (
                    response.headers.get("content-type", "").split(";")[0] != "image/webp"
                    or not 0 < size <= 2 * 1024 * 1024
                ):
                    raise DomainError(
                        "invalid_upload",
                        "Each variant must be image/webp and no larger than 2 MiB.",
                    )
                total += size
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise DomainError(
            "upload_incomplete", "Could not verify all uploaded variants.", 409
        ) from exc
    with transaction.atomic():
        # Unique immutable storage_path prevents registering the same receipt twice.
        asset = MediaAsset.objects.create(
            **data,
            storage_path=paths["lg"],
            variants={
                key: f"{settings.SUPABASE_PUBLIC_MEDIA_BASE}/{path}" for key, path in paths.items()
            },
            bytes=total,
            mime="image/webp",
            uploaded_by=request.user,
            created_by=request.user,
            updated_by=request.user,
        )
        audit(request, asset, action="create")
    serializer.instance = asset
    return asset


# --------------------------------------------------------------------------
# Upload from the admin: the server does the work the future BOS app does in the
# browser — orient, resize to three WebP widths, push to Storage.

UPLOAD_MAX_BYTES = 15 * 1024 * 1024
VARIANT_MAX_BYTES = 2 * 1024 * 1024  # matches the bucket limit and register_asset
VARIANT_WIDTHS = {"thumb": 400, "md": 800, "lg": 1600}
ACCEPTED_FORMATS = {"JPEG", "PNG", "WEBP", "AVIF", "MPO"}  # MPO: phone JPEGs with depth data


def encode_variants(file):
    """{size: webp bytes} for a JPEG/PNG/WebP upload, plus the largest width and height."""
    from PIL import Image, ImageOps, UnidentifiedImageError

    if file.size > UPLOAD_MAX_BYTES:
        raise DomainError("invalid_upload", "Images must be 15 MB or smaller.")
    try:
        image = Image.open(file)
        if image.format not in ACCEPTED_FORMATS:
            raise DomainError("invalid_upload", "Upload a JPG, PNG or WebP image.")
        image.draft("RGB", (VARIANT_WIDTHS["lg"] * 2, VARIANT_WIDTHS["lg"] * 2))  # fast JPEG decode
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise DomainError("invalid_upload", "That file is not a readable image.") from exc
    variants, size = {}, None
    for name, width in VARIANT_WIDTHS.items():
        copy = image.copy()
        copy.thumbnail((width, width), Image.Resampling.LANCZOS)  # longest edge; never enlarges
        for quality in (82, 72, 60):
            buffer = io.BytesIO()
            copy.save(buffer, "WEBP", quality=quality, method=4)
            if buffer.tell() <= VARIANT_MAX_BYTES:
                break
        variants[name] = buffer.getvalue()
        size = copy.size
    return variants, size


def upload_object(path, data):
    response = httpx.post(
        f"{settings.SUPABASE_URL}/storage/v1/object/{quote(settings.SUPABASE_STORAGE_BUCKET)}/{path}",
        headers={
            **storage_headers(),
            "Content-Type": "image/webp",
            "x-upsert": "false",
            # Paths are unique per upload, so browsers may keep them for a year.
            "cache-control": "max-age=31536000",
        },
        content=data,
        timeout=30,
    )
    response.raise_for_status()


def store_image(file, folder="admin"):
    """Encode and upload an image; returns MediaAsset field values (nothing saved yet)."""
    storage_headers()  # fail fast with a clear message when Storage is not configured
    variants, (width, height) = encode_variants(file)
    prefix = f"{folder}/{uuid4().hex}"
    paths = {name: f"{prefix}/{VARIANT_WIDTHS[name]}.webp" for name in variants}
    try:
        for name, data in variants.items():
            upload_object(paths[name], data)
    except httpx.HTTPError as exc:
        raise DomainError(
            "storage_unavailable", "Could not upload the image. Try again.", 503
        ) from exc
    return {
        "storage_path": paths["lg"],
        "variants": {
            name: f"{settings.SUPABASE_PUBLIC_MEDIA_BASE}/{path}" for name, path in paths.items()
        },
        "width": width,
        "height": height,
        "bytes": sum(len(data) for data in variants.values()),
        "mime": "image/webp",
    }
