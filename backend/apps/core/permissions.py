import secrets

from django.conf import settings
from rest_framework.permissions import SAFE_METHODS, BasePermission

GLOBAL_ROLES = {"owner", "admin"}
STAFF_ROLES = GLOBAL_ROLES | {"manager", "staff"}


def is_global(user):
    return user.is_authenticated and user.is_active and user.role in GLOBAL_ROLES


def scoped_locations(user):
    from apps.locations.models import Location

    qs = Location.objects.all()
    if not is_global(user):
        qs = qs.filter(staffassignment__user=user, staffassignment__is_active=True)
    return qs


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.is_active
            and request.user.role in STAFF_ROLES
        )


class IsGlobalAdmin(BasePermission):
    def has_permission(self, request, view):
        return is_global(request.user)


class StaffReadAdminWrite(IsStaff):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and (
            request.method in SAFE_METHODS or is_global(request.user)
        )


class HasJobToken(BasePermission):
    def has_permission(self, request, view):
        token = request.headers.get("X-Job-Token", "")
        return bool(
            settings.JOB_TOKEN and token and secrets.compare_digest(token, settings.JOB_TOKEN)
        )
