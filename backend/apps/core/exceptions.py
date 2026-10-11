import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class DomainError(APIException):
    status_code = 400
    default_code = "invalid_request"

    def __init__(self, code, message, status=400):
        self.status_code = status
        self.error_code = code
        super().__init__(message, code=code)


def exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(getattr(exc, "message_dict", exc.messages))
    if isinstance(exc, IntegrityError):
        exc = DomainError("conflict", "The change conflicts with existing data.", 409)
    response = drf_exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API error", exc_info=exc)
        return Response(
            {
                "error": {
                    "code": "internal_error",
                    "message": "An unexpected error occurred.",
                    "fields": {},
                }
            },
            status=500,
        )
    detail = response.data
    code = getattr(exc, "error_code", getattr(exc, "default_code", "invalid_request"))
    message = (
        str(detail.get("detail", "Please check the submitted fields."))
        if isinstance(detail, dict)
        else "Please check the submitted fields."
    )
    fields = detail if isinstance(detail, (dict, list)) and "detail" not in detail else {}
    response.data = {"error": {"code": code, "message": message, "fields": fields}}
    return response
