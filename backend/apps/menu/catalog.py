"""
What a customer can order at a café, with prices resolved. Shared by the mobile app's menu
endpoints and server-side order pricing, so the app is charged exactly what it was shown.
"""

from dataclasses import dataclass, field

from django.db.models import Prefetch, Q

from .models import (
    LocationMenuItem,
    MenuItem,
    MenuItemDietaryTag,
    MenuItemModifierGroup,
    ModifierOption,
)
from .services import effective_price


@dataclass
class Group:
    code: str
    name: str
    required: bool
    max_select: int
    options: list = field(default_factory=list)  # [(name, price_cents)]


@dataclass
class Entry:
    item: MenuItem
    price_cents: int
    available: bool
    groups: list = field(default_factory=list)

    @property
    def category_slug(self):
        return self.item.category.slug


def menu_items(location=None, slugs=None, any_location=False):
    """
    Published items with live prices, in menu order.

    location: a café's menu (chain-wide items plus its own; hidden ones dropped).
    any_location: every published item whatever the café (item detail by id).
    """
    links = (
        MenuItemModifierGroup.objects.filter(is_active=True, modifier_group__is_active=True)
        .select_related("modifier_group")
        .prefetch_related(
            Prefetch(
                "modifier_group__options", queryset=ModifierOption.objects.filter(is_active=True)
            )
        )
    )
    qs = MenuItem.objects.filter(is_published=True, category__is_active=True)
    if not any_location:
        qs = qs.filter(
            Q(location__isnull=True) | Q(location=location)
            if location
            else Q(location__isnull=True)
        )
    if slugs is not None:
        qs = qs.filter(slug__in=slugs)
    qs = qs.select_related("category", "image").prefetch_related(
        Prefetch("dietary_links", queryset=MenuItemDietaryTag.objects.select_related("tag")),
        Prefetch("modifier_links", queryset=links),
    )
    overrides = (
        {row.menu_item_id: row for row in LocationMenuItem.objects.filter(location=location)}
        if location
        else {}
    )
    entries = []
    for item in qs:  # same order as the website bootstrap (sort_order, slug)
        override = overrides.get(item.pk)
        if override and override.is_hidden:
            continue
        groups = [
            Group(
                code=link.modifier_group.code,
                name=link.modifier_group.name,
                required=link.modifier_group.is_required,
                max_select=link.modifier_group.max_select,
                options=[(o.name, o.price_delta_cents) for o in link.modifier_group.options.all()],
            )
            for link in item.modifier_links.all()
        ]
        entries.append(
            Entry(
                item=item,
                price_cents=effective_price(item, override),
                available=not override or override.is_available,
                groups=groups,
            )
        )
    return entries
