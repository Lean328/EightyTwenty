import hashlib
import hmac

from django.conf import settings
from django.core import signing

from apps.core.permissions import scoped_locations
from apps.mobile.errors import AppError
from . import pins

from functools import wraps

SALT = "eightytwenty.pos.staff-session.v1"


def session_max_age():
    return getattr(settings, "POS_STAFF_SESSION_MAX_AGE", 12 * 60 * 60)


def pin_version(user):
    return hashlib.sha256(user.pos_pin.encode()).hexdigest()


def issue_staff_session(request, staff):
    terminal = request.headers.get("X-Terminal-Id", "").strip()
    if not terminal or len(terminal) > 60:
        raise AppError("VALIDATION", "A terminal ID of 1–60 characters is required.", 422)

    payload = {
        "staff": str(staff.pk),
        "account": str(request.user.pk),
        "terminal": terminal,
        "pin_version": pin_version(staff),
    }
    return signing.dumps(payload, salt=SALT)


def read_staff_session(request, token, location=None):
    try:
        payload = signing.loads(token, salt=SALT, max_age=session_max_age())
    except (signing.BadSignature, TypeError, ValueError):
        raise AppError("STAFF_SESSION_REQUIRED", "Enter your staff PIN again.", 403)

    if not isinstance(payload, dict):
        raise AppError("STAFF_SESSION_REQUIRED", "Invalid staff session.", 403)

    terminal = request.headers.get("X-Terminal-Id", "").strip()
    if payload.get("account") != str(request.user.pk) or payload.get("terminal") != terminal:
        raise AppError("STAFF_SESSION_MISMATCH", "The staff session belongs to another account or terminal.", 403)

    staff = pins.team().filter(pk=payload.get("staff")).first()
    if staff is None or not staff.pos_pin:
        raise AppError("STAFF_SESSION_REQUIRED", "This staff session is no longer valid.", 403)

    if not hmac.compare_digest(payload.get("pin_version", ""), pin_version(staff)):
        raise AppError("STAFF_SESSION_REQUIRED", "The staff PIN has changed. Sign in again.", 403)

    account_locations = scoped_locations(request.user)
    staff_locations = scoped_locations(staff)
    if location is not None:
        account_locations = account_locations.filter(pk=location.pk)
        staff_locations = staff_locations.filter(pk=location.pk)

    if not account_locations.filter(pk__in=staff_locations.values("pk")).exists():
        raise AppError("FORBIDDEN", "This staff member cannot work at the selected cafe.", 403)

    return staff


def require_staff_permission(request, permission, location=None):
    token = request.headers.get("X-Pos-Staff", "")
    staff = read_staff_session(request, token, location)
    permissions = pins.permissions(staff)

    if "*" not in permissions and permission not in permissions:
        raise AppError("FORBIDDEN", "This staff member is not permitted to perform this action.", 403)

    return staff

def require_order_staff(permission):
    def decorate(handler):
        @wraps(handler)
        def wrapped(self, request, *args, **kwargs):
            from . import services

            order = services.order_for(request.user, kwargs["order_id"])
            request.pos_staff = require_staff_permission(request, permission, order.location)
            return handler(self, request, *args, **kwargs)

        return wrapped
    return decorate

def require_shift_staff(permission):
    def decorate(handler):
        @wraps(handler)
        def wrapped(self, request, *args, **kwargs):
            from . import services

            shift = services.shift_for(request.user, kwargs["shift_id"])
            services.require_shift_terminal(request, shift)
            request.pos_staff = require_staff_permission(request, permission, shift.location)
            return handler(self, request, *args, **kwargs)
        return wrapped
    return decorate

def require_open_shift_staff(handler):
    @wraps(handler)
    def wrapped(self, request, *args, **kwargs):
        from . import serializers, services

        data = self.valid(serializers.PosShiftIn)
        location = services.location_for(request.user, data["cafe"])
        request.pos_staff = require_staff_permission(request, "pos", location)
        return handler(self, request, *args, **kwargs)
    return wrapped

def require_embedded_payment_staff(handler):
    @wraps(handler)
    def wrapped(self, request, *args, **kwargs):
        from . import serializers, services

        data = self.valid(serializers.PosOrderIn)
        if data.get("payments"):
            location = services.location_for(request.user, data["cafe"])
            request.pos_staff = require_staff_permission(request, "pos", location)
        return handler(self, request, *args, **kwargs)
    return wrapped

def require_staff_access(permission):
    def decorate(handler):
        @wraps(handler)
        def wrapped(self, request, *args, **kwargs):
            request.pos_staff = require_staff_permission(request, permission)
            return handler(self, request, *args, **kwargs)
        return wrapped
    return decorate