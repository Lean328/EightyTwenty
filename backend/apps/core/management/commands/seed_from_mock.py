import hashlib
import json
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from apps.core.models import SiteSettings
from apps.enquiries.models import CateringPackage
from apps.locations.models import Location, LocationImage
from apps.media.models import MediaAsset
from apps.menu.models import (
    Category,
    DietaryTag,
    MenuItem,
    MenuItemModifierGroup,
    ModifierGroup,
    ModifierOption,
)
from apps.menu.services import cents_from_aud, set_dietary_tags


def upsert(model, lookup, values):
    obj = model.objects.filter(**lookup).first() or model(**lookup)
    for key, value in values.items():
        setattr(obj, key, value)
    obj.full_clean()
    obj.save()
    return obj


def legacy_asset(path):
    if not path:
        return None
    asset = MediaAsset.objects.filter(legacy_path=path).first()
    return asset or MediaAsset.objects.create(legacy_path=path, mime="image/jpeg")


class Command(BaseCommand):
    help = "Import an exported mock snapshot transactionally. Re-running updates matching slugs; it never deletes business records."

    def add_arguments(self, parser):
        parser.add_argument("snapshot", type=Path)
        parser.add_argument(
            "--update-existing",
            action="store_true",
            help="Allow running on a database that already has data (overwrites matching slugs).",
        )

    def handle(self, *args, **options):
        # Local dev shares the production database, so a stray re-run would overwrite
        # prices and copy edited in the admin. Only an empty database is seeded by default.
        if Location.objects.exists() and not options["update_existing"]:
            raise CommandError(
                "This database already has data; seeding again overwrites admin edits. "
                "Pass --update-existing only if that is intended."
            )
        try:
            data = json.loads(options["snapshot"].read_text(encoding="utf-8-sig"))
            with transaction.atomic():
                counts = self.import_snapshot(data)
        except (OSError, ValueError, KeyError, TypeError, ValidationError) as exc:
            raise CommandError(f"Import rolled back: {exc}") from exc
        self.stdout.write(self.style.SUCCESS(f"Imported {counts}"))

    def import_snapshot(self, data):
        for key in ["LOCATIONS", "CATEGORIES", "MENU", "CATERING"]:
            if not isinstance(data[key], list):
                raise ValueError(f"{key} must be an array")
            ids = [row["id"] for row in data[key]]
            if len(set(ids)) != len(ids):
                raise ValueError(f"Duplicate IDs in {key}")
        location_mapping = {
            "name": "name",
            "sub": "subtitle",
            "address": "address",
            "phone": "phone",
            "email": "email",
            "note": "note",
            "wait": "wait_text",
            "booking": "booking_label",
            "order": "external_order_url",
            "hours": "hours_text",
            "hoursShort": "hours_short_text",
        }
        methods = {"Pickup": "pickup", "Delivery": "delivery", "Dine In": "dine_in"}
        for order, row in enumerate(data["LOCATIONS"]):
            values = {dest: row.get(source, "") for source, dest in location_mapping.items()}
            values.update(
                status="tbc" if row.get("tbc") else "open" if row.get("open", True) else "closed",
                fulfilment_methods=[methods[m] for m in row.get("methods", [])],
                is_flagship=row.get("flagship", False),
                is_gluten_free=row.get("gf", False),
                is_limited_menu=row.get("limited", False),
                sort_order=order,
                is_published=True,
            )
            location = upsert(Location, {"slug": row["id"]}, values)
            for position, key in enumerate(["img", "img2", "img3"]):
                if row.get(key):
                    upsert(
                        LocationImage,
                        {"location": location, "position": position},
                        {"asset": legacy_asset(row[key])},
                    )
        for order, row in enumerate(data["CATEGORIES"]):
            upsert(
                Category,
                {"slug": row["id"]},
                {
                    "name": row["name"],
                    "note": row.get("note", ""),
                    "sort_order": order,
                    "is_active": True,
                },
            )
        for order, row in enumerate(data["MENU"]):
            category = Category.objects.filter(slug=row["cat"]).first()
            if category is None:
                raise ValueError(f"Unknown category {row['cat']}")
            item = upsert(
                MenuItem,
                {"slug": row["id"]},
                {
                    "category": category,
                    "name": row["name"],
                    "description": row.get("desc", ""),
                    "base_price_cents": cents_from_aud(row["price"]),
                    "image": legacy_asset(row.get("img", "")),
                    "is_featured": row.get("featured", False),
                    "is_published": True,
                    "sort_order": order,
                    "price_source": row.get("priceSource", ""),
                },
            )
            tags = [
                DietaryTag.objects.get_or_create(code=code, defaults={"label": code})[0]
                for code in row.get("diet", [])
            ]
            set_dietary_tags(item, tags)
            links = []
            for index, group_data in enumerate(row.get("mods", [])):
                # Full definition deduplication avoids merging distinct groups with the same code.
                fingerprint = hashlib.sha256(
                    json.dumps(group_data, sort_keys=True, ensure_ascii=False).encode()
                ).hexdigest()
                group = upsert(
                    ModifierGroup,
                    {"import_key": fingerprint},
                    {
                        "code": group_data["id"],
                        "name": group_data["name"],
                        "is_required": group_data.get("required", False),
                        "min_select": 1 if group_data.get("required") else 0,
                        "max_select": group_data.get("max", 0),
                    },
                )
                for option_order, (name, price) in enumerate(group_data.get("options", [])):
                    upsert(
                        ModifierOption,
                        {"group": group, "name": name},
                        {
                            "price_delta_cents": cents_from_aud(price),
                            "sort_order": option_order,
                            "is_active": True,
                        },
                    )
                link = upsert(
                    MenuItemModifierGroup,
                    {"menu_item": item, "modifier_group": group},
                    {"sort_order": index},
                )
                links.append(link.pk)
            # Reconcile only join rows of the explicitly imported item.
            item.modifier_links.exclude(pk__in=links).delete()
        for order, row in enumerate(data["CATERING"]):
            upsert(
                CateringPackage,
                {"slug": slugify(row["id"])},
                {
                    "name": row["id"],
                    "price_cents": cents_from_aud(row["price"]),
                    "unit": row.get("unit", "per person"),
                    "blurb": row.get("blurb", ""),
                    "items": row.get("items", []),
                    "image": legacy_asset(row.get("img", "")),
                    "image_position": row.get("imagePosition", "50% 50%"),
                    "sort_order": order,
                    "is_active": True,
                },
            )
        if "ORDER_RULES" in data:
            settings = SiteSettings.load()
            settings.order_rules = data["ORDER_RULES"]
            settings.save()
        return {key: len(data[key]) for key in ["LOCATIONS", "CATEGORIES", "MENU", "CATERING"]}
