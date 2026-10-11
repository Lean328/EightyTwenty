"""
Move images that still point at the website folder (legacy_path "img/...") into Supabase
Storage: each file is re-encoded to 400/800/1600 px WebP like an admin upload. Assets that
already have Storage files are skipped, so it is safe to run again. Dry run by default.

    python manage.py upload_legacy_media            # preview
    python manage.py upload_legacy_media --apply    # upload and update the assets
"""

from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from apps.core.exceptions import DomainError
from apps.media.models import MediaAsset
from apps.media.services import store_image


class Command(BaseCommand):
    help = "Upload website images referenced by legacy_path to Supabase Storage."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Upload and save.")
        parser.add_argument(
            "--root",
            default=str(Path(settings.BASE_DIR).parent / "website"),
            help="Folder the legacy paths are relative to (default: the website folder).",
        )

    def handle(self, *args, apply=False, root=None, **options):
        root = Path(root)
        assets = MediaAsset.objects.filter(storage_path="").exclude(legacy_path="")
        done = failed = 0
        for asset in assets.order_by("legacy_path"):
            source = root / asset.legacy_path
            if not source.is_file():
                self.stdout.write(f"skip  {asset.legacy_path}: file not found")
                failed += 1
                continue
            if not apply:
                self.stdout.write(f"plan  {asset.legacy_path}")
                continue
            try:
                with source.open("rb") as handle:
                    stored = store_image(File(handle, name=source.name), "website")
            except DomainError as exc:
                self.stdout.write(f"fail  {asset.legacy_path}: {exc.detail}")
                failed += 1
                continue
            for field, value in stored.items():
                setattr(asset, field, value)
            asset.save()  # one save per asset so menu_version and the bootstrap ETag update
            done += 1
            self.stdout.write(f"done  {asset.legacy_path} -> {stored['bytes'] // 1024} KB")
        if apply:
            self.stdout.write(self.style.SUCCESS(f"Uploaded {done} image(s), {failed} skipped."))
        else:
            self.stdout.write("Preview only. Run again with --apply to upload.")
