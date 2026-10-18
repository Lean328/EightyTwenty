"""Who is who in the BOS workspace (Django admin), and which cafés they see.

Three levels:
- chain owner: a Django superuser; every café, every table.
- café owner: role "manager" with is_staff, scoped to the cafés they are assigned to.
- staff: role "staff" with is_staff, scoped the same way, mostly read-only.

A manager or staff member with no active assignment cannot open the workspace.
"""

from django.db.models import Q

CHAIN = "chain"
MANAGER = "manager"
STAFF = "staff"
ALL = (CHAIN, MANAGER, STAFF)
OWNERS = (CHAIN, MANAGER)
ROLE_NAMES = {CHAIN: "Chain owner", MANAGER: "Café owner", STAFF: "Staff"}


def bos_role(user):
    if not (user.is_authenticated and user.is_active):
        return None
    if user.is_superuser:
        return CHAIN
    if user.is_staff and user.role in (MANAGER, STAFF):
        return user.role
    return None


def bos_location_ids(user):
    """Ids of the cafés this user works with (None = every café). Cached per request user."""
    if bos_role(user) == CHAIN:
        return None
    if not hasattr(user, "_bos_location_ids"):
        from apps.accounts.models import StaffAssignment

        user._bos_location_ids = set(
            StaffAssignment.objects.filter(user=user, is_active=True).values_list(
                "location_id", flat=True
            )
        )
    return user._bos_location_ids


def bos_locations(user):
    from apps.locations.models import Location

    ids = bos_location_ids(user)
    return Location.objects.all() if ids is None else Location.objects.filter(pk__in=ids)


def has_bos_access(user):
    role = bos_role(user)
    return role == CHAIN or (role in (MANAGER, STAFF) and bool(bos_location_ids(user)))


def in_scope(user, location_id):
    ids = bos_location_ids(user)
    return ids is None or location_id in ids


def scope_filter(user, lookup="location"):
    """Q limiting rows to the user's cafés (empty Q for the chain owner)."""
    ids = bos_location_ids(user)
    return Q() if ids is None else Q(**{f"{lookup}__in": ids})
