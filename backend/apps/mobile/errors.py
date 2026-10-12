"""
Errors in the shape the mobile app expects (EightyTwentyMobile/src/services/api/client.ts):

    {"error": {"code": "VALIDATION", "message": "Enter a valid email address.",
               "fields": {"email": "invalid"}}}

`code` is one of the app's AppErrorCode values, `message` is shown to customers verbatim,
and `fields` maps a request field to a short reason ("required", "invalid", "too_short",
"taken"). The website/BOS API keeps its own error format (apps.core.exceptions).
"""

import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db import IntegrityError
from django.http import Http404
from rest_framework import exceptions
from rest_framework.response import Response

from apps.core.exceptions import DomainError

logger = logging.getLogger(__name__)

STATUS_CODES = {
    400: "VALIDATION",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION",
}
REASONS = {
    "required": "required",
    "blank": "required",
    "null": "required",
    "min_length": "too_short",
    "max_length": "too_long",
}


class AppError(exceptions.APIException):
    def __init__(self, code, message, status=422, fields=None):
        self.status_code = status
        self.app_code = code
        self.fields = fields or {}
        super().__init__(message)


def invalid(message, **fields):
    return AppError("VALIDATION", message, 422, fields)


def not_found(message):
    return AppError("NOT_FOUND", message, 404)


def first_message(detail):
    if isinstance(detail, dict):
        for value in detail.values():
            if found := first_message(value):
                return found
    elif isinstance(detail, list):
        for value in detail:
            if found := first_message(value):
                return found
    elif detail:
        return str(detail)
    return ""


def field_reasons(codes):
    if not isinstance(codes, dict):
        return {}
    reasons = {}
    for name, value in codes.items():
        if name == "non_field_errors":
            continue
        first = value[0] if isinstance(value, list) and value else value
        reasons[name] = REASONS.get(first, "invalid") if isinstance(first, str) else "invalid"
    return reasons


def body(code, message, fields=None):
    return {"error": {"code": code, "message": message, "fields": fields or {}}}


def app_exception_handler(exc, context):
    headers = {}
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()
    if getattr(exc, "auth_header", None):
        headers["WWW-Authenticate"] = exc.auth_header

    if isinstance(exc, AppError):
        status, data = exc.status_code, body(exc.app_code, str(exc.detail), exc.fields)
    elif isinstance(exc, exceptions.ValidationError):
        fields = field_reasons(exc.get_codes())
        message = first_message(exc.detail) if len(fields) <= 1 else ""
        status = 422
        data = body("VALIDATION", message or "Please check the highlighted fields.", fields)
    elif isinstance(exc, exceptions.ParseError):
        status, data = 400, body("VALIDATION", "We couldn’t read that request. Please try again.")
    elif isinstance(exc, (exceptions.NotAuthenticated, exceptions.AuthenticationFailed)):
        status = exc.status_code
        data = body(STATUS_CODES.get(status, "UNAUTHORIZED"), "Please log in to continue.")
    elif isinstance(exc, exceptions.Throttled):
        status = 429
        if exc.wait:
            headers["Retry-After"] = str(int(exc.wait))
        data = body("TOO_MANY_REQUESTS", "Too many attempts. Please wait a minute and try again.")
    elif isinstance(exc, DomainError):
        status = exc.status_code
        data = body(STATUS_CODES.get(status, "VALIDATION"), str(exc.detail))
    elif isinstance(exc, IntegrityError):
        status = 409
        data = body("CONFLICT", "That request is already being processed. Please wait a moment.")
    elif isinstance(exc, exceptions.APIException):
        status = exc.status_code
        code = STATUS_CODES.get(status, "SERVER" if status >= 500 else "UNKNOWN")
        data = body(code, first_message(exc.detail) or "Something went wrong. Please try again.")
    else:
        logger.exception("Unhandled app API error", exc_info=exc)
        status = 500
        data = body("SERVER", "Something went wrong on our side. Please try again.")
    return Response(data, status=status, headers=headers)
