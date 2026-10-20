"""
Real photos for a LOCAL demo database. Menu items, cafés and catering packages point at the
photos the live site already keeps in Supabase (read from the public bootstrap); with --folder,
the gaps (items without a photo, app offers, a few library photos) are filled by uploading
café photos from that folder. Refuses any database that is not SQLite or localhost.
"""

import re
from pathlib import Path

import httpx
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from apps.cms.models import Offer
from apps.enquiries.models import CateringPackage
from apps.locations.models import Location
from apps.menu.models import MenuItem

from ...models import MediaAsset
from ...services import UPLOAD_MAX_BYTES, brand_alt, label_from_filename, store_image

PHOTO_TYPES = {".jpg", ".jpeg", ".png", ".webp"}
WORD = re.compile(r"[a-z]{3,}")


def words(text):
    return set(WORD.findall((text or "").lower()))


def point_at(asset, lg):
    """Use a photo already in Supabase: its three sizes sit side by side (400/800/1600)."""
    base = lg.rsplit("/", 1)[0]
    asset.variants = {"thumb": f"{base}/400.webp", "md": f"{base}/800.webp", "lg": lg}
    asset.save()


class Command(BaseCommand):
    help = "Give a LOCAL demo database real photos (see the module docstring)."

    def add_arguments(self, parser):
        parser.add_argument("--source", default="https://eightytwenty-api.onrender.com")
        parser.add_argument("--folder", type=Path, help="Café photos to upload for the gaps.")
        parser.add_argument("--library", type=int, default=12, help="Extra library photos.")

    def handle(self, *args, **options):
        host = connection.settings_dict.get("HOST") or ""
        if connection.vendor != "sqlite" and host not in ("localhost", "127.0.0.1"):
            raise CommandError("Demo photos only go into a local database (SQLite or localhost).")
        linked = self.link_live_photos(options["source"])
        self.stdout.write(f"Pointed {linked} photos at the live site's Supabase copies.")
        if options["folder"]:
            uploaded = self.fill_gaps(options["folder"], options["library"])
            self.stdout.write(self.style.SUCCESS(f"Uploaded {uploaded} photos for the gaps."))

    def link_live_photos(self, source):
        try:
            data = httpx.get(f"{source.rstrip('/')}/api/v1/public/bootstrap", timeout=30).json()
        except (httpx.HTTPError, ValueError) as exc:
            raise CommandError(f"Could not read {source}: {exc}") from exc
        count = 0
        for row in data.get("MENU", []):
            item = MenuItem.objects.filter(slug=row["id"]).select_related("image").first()
            if item and item.image and row.get("img"):
                point_at(item.image, row["img"])
                count += 1
        for row in data.get("CATERING", []):
            package = CateringPackage.objects.filter(name=row["id"]).select_related("image").first()
            if package and package.image and row.get("img"):
                point_at(package.image, row["img"])
                count += 1
        for row in data.get("LOCATIONS", []):
            cafe = Location.objects.filter(slug=row["id"]).first()
            if not cafe:
                continue
            for image in cafe.images.select_related("asset"):
                url = row.get(["img", "img2", "img3"][image.position])
                if url:
                    point_at(image.asset, url)
                    count += 1
        return count

    def fill_gaps(self, folder, library):
        photos = sorted(
            p
            for p in folder.rglob("*")
            if p.suffix.lower() in PHOTO_TYPES and p.stat().st_size <= UPLOAD_MAX_BYTES
        )
        food = [p for p in photos if not {"icons", "brand", "deco"} & set(p.parts)]
        if not food:
            raise CommandError(f"No photos found in {folder}.")
        used, count = set(), 0

        def upload(path, label):
            nonlocal count
            with path.open("rb") as handle:
                values = store_image(File(handle, name=path.name), folder="demo")
            count += 1
            used.add(path)
            return MediaAsset.objects.create(**values, alt_text=brand_alt(label))

        def best(name, pool):
            fresh = [p for p in pool if p not in used] or pool
            return max(fresh, key=lambda p: len(words(name) & words(p.stem)))

        for item in MenuItem.objects.filter(image__isnull=True, is_published=True):
            item.image = upload(best(item.name, food), item.name)
            item.save()
        for offer in Offer.objects.filter(image__isnull=True):
            offer.image = upload(best(offer.name + " " + offer.line, food), offer.name)
            offer.save()
        scenes = [p for p in food if {"lifestyle", "loc", "wholesale", "promo"} & set(p.parts)]
        for path in [p for p in scenes if p not in used][:library]:
            upload(path, label_from_filename(path.name))
        return count
