"""
Give every photo without alt text one in the house style, named after what uses it:
"Housemade Sourdough – EightyTwenty", "Braddon café interior – EightyTwenty". Photos that
already have alt text are left alone. Dry run by default.

    python manage.py fill_alt_text            # preview
    python manage.py fill_alt_text --apply    # write
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.enquiries.models import CateringPackage
from apps.locations.models import LocationImage
from apps.media.models import MediaAsset
from apps.media.services import brand_alt, label_from_filename

VIEWS = ("interior", "outdoor", "exterior")


def suggest(asset):
    item = asset.menuitem_set.order_by("sort_order", "name").first()
    if item:
        return brand_alt(item.name)
    package = CateringPackage.objects.filter(image=asset).order_by("sort_order").first()
    if package:
        return brand_alt(f"{package.name} catering")
    photo = LocationImage.objects.filter(asset=asset).select_related("location").first()
    if photo:
        view = next((word for word in VIEWS if word in asset.legacy_path.lower()), "")
        return brand_alt(f"{photo.location.name} café {view}".strip())
    return brand_alt(label_from_filename(asset.legacy_path or asset.storage_path))


class Command(BaseCommand):
    help = "Fill empty Media library alt text from the item, package or café using the photo."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Write the alt text.")

    def handle(self, *args, apply=False, **options):
        assets = MediaAsset.objects.filter(alt_text="").order_by("legacy_path", "created_at")
        count = 0
        with transaction.atomic():
            for asset in assets:
                asset.alt_text = suggest(asset)
                self.stdout.write(f"{'write' if apply else 'plan '} {asset.alt_text}")
                if apply:
                    asset.save()  # one save each so menu_version moves on
                count += 1
        if apply:
            self.stdout.write(self.style.SUCCESS(f"Alt text filled on {count} photo(s)."))
        else:
            self.stdout.write("Preview only. Run again with --apply to write.")
