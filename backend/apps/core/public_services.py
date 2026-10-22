from decimal import Decimal

from django.db.models import Prefetch, Q
from django.utils import timezone

from apps.cms.models import NavigationItem, Page
from apps.enquiries.models import CateringPackage
from apps.locations.models import Location, LocationImage
from apps.menu.models import (
    Category,
    LocationMenuItem,
    MenuItem,
    MenuItemDietaryTag,
    MenuItemModifierGroup,
    ModifierOption,
)
from apps.menu.services import effective_price

from .models import SiteSettings


def img(asset):
    """Website image URL: the largest stored WebP (the site was built on ≤1600 px photos)."""
    if not asset:
        return ""
    return asset.variants.get("lg") or asset.public_url


def aud(cents):
    return Decimal(cents) / Decimal(100)


def locations_data(slug=None):
    qs = Location.objects.filter(is_published=True).prefetch_related(
        Prefetch(
            "images", queryset=LocationImage.objects.filter(is_active=True).select_related("asset")
        )
    )
    if slug:
        qs = qs.filter(slug=slug)
    methods = {"pickup": "Pickup", "delivery": "Delivery", "dine_in": "Dine In"}
    rows = []
    for location in qs:
        images = {row.position: img(row.asset) for row in location.images.all()}
        row = {
            "id": location.slug,
            "name": location.name,
            "sub": location.subtitle,
            "address": location.address,
            "phone": location.phone,
            "hours": location.hours_text,
            "hoursShort": location.hours_short_text,
            "open": location.status == "open",
            "methods": [methods[m] for m in location.fulfilment_methods],
            "note": location.note,
            "wait": location.wait_text,
            "img": images.get(0, ""),
            "img2": images.get(1, ""),
            "img3": images.get(2, ""),
            "order": location.external_order_url,
            "email": location.email,
            "booking": location.booking_label,
        }
        for key, enabled in {
            "flagship": location.is_flagship,
            "limited": location.is_limited_menu,
            "gf": location.is_gluten_free,
            "tbc": location.status == "tbc",
        }.items():
            if enabled:
                row[key] = True
        rows.append(row)
    return rows


def categories_data():
    return [
        {"id": row.slug, "name": row.name, "note": row.note}
        for row in Category.objects.filter(is_active=True)
    ]


def menu_data(location=None):
    links = (
        MenuItemModifierGroup.objects.filter(is_active=True, modifier_group__is_active=True)
        .select_related("modifier_group")
        .prefetch_related(
            Prefetch(
                "modifier_group__options", queryset=ModifierOption.objects.filter(is_active=True)
            )
        )
    )
    # A café-only item appears only when that café's menu is asked for.
    only_here = (
        Q(location__isnull=True) | Q(location=location) if location else Q(location__isnull=True)
    )
    items = (
        MenuItem.objects.filter(only_here, is_published=True, category__is_active=True)
        .select_related("category", "image")
        .prefetch_related(
            Prefetch("dietary_links", queryset=MenuItemDietaryTag.objects.select_related("tag")),
            Prefetch("modifier_links", queryset=links),
        )
    )
    overrides = (
        {row.menu_item_id: row for row in LocationMenuItem.objects.filter(location=location)}
        if location
        else {}
    )
    result = []
    for item in items:
        override = overrides.get(item.pk)
        if override and override.is_hidden:
            continue
        mods = []
        for link in item.modifier_links.all():
            group = link.modifier_group
            mods.append(
                {
                    "id": group.code,
                    "name": group.name,
                    "required": group.is_required,
                    "max": group.max_select,
                    "options": [
                        [opt.name, aud(opt.price_delta_cents)] for opt in group.options.all()
                    ],
                }
            )
        row = {
            "id": item.slug,
            "cat": item.category.slug,
            "name": item.name,
            "price": aud(effective_price(item, override)),
            "diet": [link.tag.code for link in item.dietary_links.all()],
            "img": img(item.image),
            "desc": item.description,
            "mods": mods,
        }
        if item.is_featured:
            row["featured"] = True
        if item.price_source:
            row["priceSource"] = item.price_source
        if override and not override.is_available:
            row["available"] = False
        result.append(row)
    return result


def catering_data():
    return [
        {
            "id": row.name,
            "price": f"${aud(row.price_cents):.2f}".removesuffix(".00"),
            "unit": row.unit,
            "img": img(row.image),
            "imagePosition": row.image_position,
            "blurb": row.blurb,
            "items": row.items,
        }
        for row in CateringPackage.objects.filter(is_active=True).select_related("image")
    ]


def published_pages():
    return Page.objects.filter(status="published").filter(
        Q(published_at__isnull=True) | Q(published_at__lte=timezone.now())
    )


def settings_data(settings=None):
    settings = settings or SiteSettings.load()
    nav = list(
        NavigationItem.objects.filter(is_active=True)
        .filter(Q(page__isnull=True) | Q(page__in=published_pages()))
        .select_related("page")
    )
    visible = {row.pk for row in nav}
    # Remove descendants of unpublished/inactive parent links.
    while True:
        valid = {
            row.pk
            for row in nav
            if row.pk in visible and (row.parent_id is None or row.parent_id in visible)
        }
        if valid == visible:
            break
        visible = valid
    return {
        "brand_name": settings.brand_name,
        "contact_email": settings.contact_email,
        "social_links": settings.social_links,
        "footer": settings.footer,
        "announcement": settings.announcement,
        "navigation": [
            {
                "id": row.pk,
                "menu": row.menu,
                "label": row.label,
                "url": row.url or f"/{row.page.slug}",
                "parent": row.parent_id,
            }
            for row in nav
            if row.pk in visible
        ],
        "pages": [
            {
                "slug": page.slug,
                "title": page.title,
                "seo_title": page.seo_title,
                "seo_description": page.seo_description,
            }
            for page in published_pages().order_by("slug")
        ],
    }


def bootstrap(location=None, settings=None):
    settings = settings or SiteSettings.load()
    return {
        "version": settings.menu_version,
        "generatedAt": timezone.now(),
        "LOCATIONS": locations_data(),
        "CATEGORIES": categories_data(),
        "MENU": menu_data(location),
        "CATERING": catering_data(),
        "ORDER_RULES": settings.order_rules,
        "SETTINGS": settings_data(settings),
    }
