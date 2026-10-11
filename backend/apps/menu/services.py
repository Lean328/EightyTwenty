from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404

from apps.core.exceptions import DomainError
from apps.core.permissions import is_global, scoped_locations
from apps.core.services import audit, snapshot

from .models import LocationMenuItem, MenuItem, MenuItemDietaryTag


def set_dietary_tags(item, tags, actor=None):
    item.dietary_links.exclude(tag__in=tags).delete()
    for order, tag in enumerate(tags):
        MenuItemDietaryTag.objects.update_or_create(
            menu_item=item, tag=tag, defaults={"sort_order": order, "updated_by": actor}
        )


@transaction.atomic
def save_menu_item(serializer, request):
    before = snapshot(serializer.instance)
    tags = serializer.validated_data.pop("dietary_tags", None)
    item = serializer.save(
        updated_by=request.user,
        **({"created_by": request.user} if serializer.instance is None else {}),
    )
    if tags is not None:
        set_dietary_tags(item, tags, request.user)
    item._prefetched_objects_cache = {}
    audit(request, item, before, "create" if before is None else "update")
    return item


def cents_from_aud(value):
    amount = Decimal(str(value).replace("$", "")) * 100
    if not amount.is_finite() or amount != amount.to_integral_value():
        raise ValueError("Amounts must have at most two decimal places.")
    return int(amount)


def effective_price(item, override=None):
    return (
        override.price_override_cents
        if override and override.price_override_cents is not None
        else item.base_price_cents
    )


@transaction.atomic
def set_availability(request, location_slug, item_slugs, changes):
    if not is_global(request.user) and set(changes) - {"is_available"}:
        raise DomainError(
            "permission_denied", "Only owner/admin can edit branch prices or hide items.", 403
        )
    # Lock the branch first so absent overrides can be safely created concurrently.
    location = get_object_or_404(
        scoped_locations(request.user).select_for_update(), slug=location_slug
    )
    items = list(MenuItem.objects.filter(slug__in=item_slugs))
    if len(items) != len(item_slugs):
        raise DomainError("not_found", "One or more menu items do not exist.", 404)
    rows = []
    for item in items:
        row, created = LocationMenuItem.objects.get_or_create(
            location=location,
            menu_item=item,
            defaults={"created_by": request.user, "updated_by": request.user},
        )
        before = None if created else snapshot(row)
        for key, value in changes.items():
            setattr(row, key, value)
        row.updated_by = request.user
        row.save()
        audit(request, row, before, "create" if created else "update")
        rows.append(row)
    return rows
