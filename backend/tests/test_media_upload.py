import io

import httpx
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from django.urls import reverse
from PIL import Image

from apps.core.models import AuditLog
from apps.media import services
from apps.media.models import MediaAsset

from .factories import MenuItemFactory, UserFactory

pytestmark = pytest.mark.django_db


def photo(size=(3000, 2000), fmt="JPEG", orientation=None, mode="RGB"):
    buffer = io.BytesIO()
    image = Image.new(mode, size, (200, 120, 40, 255) if mode == "RGBA" else (200, 120, 40))
    extra = {}
    if orientation:
        exif = Image.Exif()
        exif[0x0112] = orientation
        extra["exif"] = exif
    image.save(buffer, fmt, **extra)
    return SimpleUploadedFile(f"dish.{fmt.lower()}", buffer.getvalue(), f"image/{fmt.lower()}")


@pytest.fixture
def storage(settings, monkeypatch):
    settings.SUPABASE_URL = "https://example.supabase.co"
    settings.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test"
    settings.SUPABASE_PUBLIC_MEDIA_BASE = (
        "https://example.supabase.co/storage/v1/object/public/media"
    )
    uploads = {}
    monkeypatch.setattr(
        services, "upload_object", lambda path, data: uploads.__setitem__(path, data)
    )
    return uploads


@pytest.fixture
def admin_client():
    client = Client()
    client.force_login(UserFactory(is_staff=True, is_superuser=True, role="owner"))
    return client


def test_encode_variants_orients_resizes_and_outputs_webp():
    variants, size = services.encode_variants(photo(orientation=6))
    assert set(variants) == {"thumb", "md", "lg"}
    assert size == (1067, 1600)  # 3000×2000 turned upright by EXIF, then fitted to 1600
    widths = {name: Image.open(io.BytesIO(data)).size[0] for name, data in variants.items()}
    assert widths == {"thumb": 267, "md": 533, "lg": 1067}
    assert all(data[:4] == b"RIFF" and data[8:12] == b"WEBP" for data in variants.values())
    small, small_size = services.encode_variants(photo(size=(300, 200), fmt="PNG", mode="RGBA"))
    assert small_size == (300, 200)  # never enlarged


def test_encode_variants_rejects_non_images():
    junk = SimpleUploadedFile("menu.pdf", b"%PDF-1.4 not an image", "application/pdf")
    with pytest.raises(services.DomainError, match="not a readable image"):
        services.encode_variants(junk)


def test_menu_item_upload_stores_variants_and_attaches_photo(admin_client, storage):
    item = MenuItemFactory(base_price_cents=1500)
    url = reverse("admin:menu_menuitem_change", args=[item.pk])
    data = {
        "name": item.name,
        "category": str(item.category_id),
        "base_price_cents": "15.00",
        "is_published": "on",
        "sort_order": "0",
        "modifier_links-TOTAL_FORMS": "0",
        "modifier_links-INITIAL_FORMS": "0",
        "dietary_links-TOTAL_FORMS": "0",
        "dietary_links-INITIAL_FORMS": "0",
        "upload": photo(),
        "_save": "Save",
    }
    response = admin_client.post(url, data)
    assert response.status_code == 302, response.context["adminform"].form.errors
    item.refresh_from_db()
    asset = item.image
    assert (
        asset.alt_text == f"{item.name} – EightyTwenty"
        and asset.width == 1600
        and asset.mime == "image/webp"
    )
    assert sorted(storage) == sorted(
        path.split("/public/media/")[1] for path in asset.variants.values()
    )
    assert all(path.startswith("menu/") for path in storage)
    assert asset.variants["md"].endswith("/800.webp") and asset.public_url == asset.variants["md"]
    assert AuditLog.objects.filter(entity_id=str(asset.pk), action="admin_create").exists()


def test_storage_failure_shows_on_the_form_and_saves_nothing(admin_client, storage, monkeypatch):
    def broken(path, data):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(services, "upload_object", broken)
    response = admin_client.post(
        reverse("admin:media_mediaasset_add"),
        {"alt_text": "Bowl", "is_active": "on", "upload": photo()},
    )
    assert response.status_code == 200
    assert "Could not upload the image" in str(response.context["adminform"].form.errors)
    assert not MediaAsset.objects.exists()


def test_media_library_add_requires_a_file_and_accepts_one(admin_client, storage):
    url = reverse("admin:media_mediaasset_add")
    response = admin_client.post(url, {"alt_text": "Bowl", "is_active": "on"})
    assert "Choose an image to upload." in str(response.context["adminform"].form.errors)
    response = admin_client.post(
        url, {"alt_text": "Bowl", "is_active": "on", "upload": photo(fmt="PNG")}
    )
    assert response.status_code == 302
    asset = MediaAsset.objects.get()
    assert asset.storage_path.startswith("library/") and asset.uploaded_by.is_superuser
    assert len(storage) == 3


def test_upload_forms_are_multipart(admin_client):
    item = MenuItemFactory()
    for url in [
        reverse("admin:menu_menuitem_change", args=[item.pk]),
        reverse("admin:media_mediaasset_add"),
        reverse("admin:enquiries_cateringpackage_add"),
    ]:
        page = admin_client.get(url).content.decode()
        assert 'enctype="multipart/form-data"' in page and 'name="upload"' in page, url


def test_upload_legacy_media_moves_website_images_to_storage(storage, tmp_path):
    from django.core.management import call_command

    from apps.core.public_services import img

    (tmp_path / "img").mkdir()
    Image.new("RGB", (1200, 800), (10, 120, 60)).save(tmp_path / "img" / "bowl.webp", "WEBP")
    asset = MediaAsset.objects.create(legacy_path="img/bowl.webp")
    missing = MediaAsset.objects.create(legacy_path="img/gone.webp")
    call_command("upload_legacy_media", root=str(tmp_path))
    asset.refresh_from_db()
    assert asset.storage_path == "" and not storage  # preview only
    call_command("upload_legacy_media", "--apply", root=str(tmp_path))
    asset.refresh_from_db()
    assert asset.storage_path.startswith("website/") and len(storage) == 3
    assert asset.legacy_path == "img/bowl.webp" and asset.width == 1200
    assert img(asset) == asset.variants["lg"]
    missing.refresh_from_db()
    assert missing.storage_path == ""
    call_command("upload_legacy_media", "--apply", root=str(tmp_path))
    assert len(storage) == 3  # already stored: skipped


def test_photo_picker_is_labelled_as_the_library_choice(admin_client):
    for url in [reverse("admin:menu_menuitem_add"), reverse("admin:enquiries_cateringpackage_add")]:
        assert "Or pick from Media library" in admin_client.get(url).content.decode(), url


def test_photo_picker_shows_pictures_and_lists_the_library(admin_client):
    asset = MediaAsset.objects.create(
        alt_text="Granola Bowl – EightyTwenty",
        storage_path="menu/x/1600.webp",
        variants={"thumb": "https://cdn.test/400.webp", "lg": "https://cdn.test/1600.webp"},
    )
    MediaAsset.objects.create(alt_text="Old photo", legacy_path="img/old.webp", is_active=False)
    item = MenuItemFactory(image=asset)
    page = admin_client.get(reverse("admin:menu_menuitem_change", args=[item.pk])).content.decode()
    assert "data-bos-picker" in page and 'src="https://cdn.test/400.webp"' in page
    assert "admin-autocomplete" not in page.split('name="image"')[0][-400:]
    url = reverse("admin:bos_media_picker")
    rows = admin_client.get(url).json()["results"]
    assert [r["name"] for r in rows] == ["Granola Bowl – EightyTwenty"]
    assert rows[0]["thumb"] == "https://cdn.test/400.webp" and rows[0]["label"] == "Granola Bowl"
    assert admin_client.get(url, {"q": "zzz"}).json()["results"] == []


def test_photo_picker_list_is_for_people_who_edit_photos():
    from apps.accounts.models import StaffAssignment

    from .factories import LocationFactory

    cafe = LocationFactory()
    url = reverse("admin:bos_media_picker")
    for role, status in [("staff", 403), ("manager", 200)]:
        user = UserFactory(role=role, is_staff=True)
        StaffAssignment.objects.create(user=user, location=cafe)
        client = Client()
        client.force_login(user)
        assert client.get(url).status_code == status, role


def test_alt_text_defaults_to_the_house_style(admin_client, storage):
    from django.core.management import call_command

    from apps.enquiries.models import CateringPackage

    menu_photo = MediaAsset.objects.create(legacy_path="img/menu/bowl-01.webp")
    MenuItemFactory(name="Granola Bowl", image=menu_photo)
    loose = MediaAsset.objects.create(legacy_path="img/loc/braddon-interior.webp")
    package = MediaAsset.objects.create(legacy_path="img/cat/lunch.webp")
    CateringPackage.objects.create(name="Lunch", slug="lunch", price_cents=1000, image=package)
    call_command("fill_alt_text", "--apply")
    for asset, alt in [
        (menu_photo, "Granola Bowl – EightyTwenty"),
        (loose, "Braddon interior – EightyTwenty"),
        (package, "Lunch catering – EightyTwenty"),
    ]:
        asset.refresh_from_db()
        assert asset.alt_text == alt
    admin_client.post(
        reverse("admin:media_mediaasset_add"),
        {"upload": photo(), "alt_text": "", "is_active": "on", "_save": "Save"},
    )
    assert MediaAsset.objects.latest("created_at").alt_text == "Dish – EightyTwenty"


def test_app_offer_upload_goes_to_storage(admin_client, storage):
    from apps.cms.models import Offer

    offer = Offer.objects.create(name="Keep Cups", slug="keep-cups-test", line="Two on us.")
    url = reverse("admin:cms_offer_change", args=[offer.pk])
    page = admin_client.get(url).content.decode()
    assert 'enctype="multipart/form-data"' in page and 'name="upload"' in page
    data = {
        "name": offer.name,
        "slug": offer.slug,
        "tag": "",
        "line": offer.line,
        "fine": "",
        "sort_order": "0",
        "is_active": "on",
        "upload": photo(fmt="PNG"),
        "_save": "Save",
    }
    response = admin_client.post(url, data)
    assert response.status_code == 302, response.context["adminform"].form.errors
    offer.refresh_from_db()
    assert offer.image.alt_text == "Keep Cups – EightyTwenty"
    assert all(path.startswith("offers/") for path in storage) and len(storage) == 3
