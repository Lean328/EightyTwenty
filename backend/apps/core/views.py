from django.db import transaction
from django.http import (
    HttpResponse,
    HttpResponsePermanentRedirect,
    HttpResponseRedirect,
    JsonResponse,
)
from django.template.loader import render_to_string
from django.templatetags.static import static
from rest_framework import mixins, viewsets

from .permissions import StaffReadAdminWrite
from .services import save_managed

# Everything that is not the API is the BOS workspace (served at the site root).
ERRORS = {
    400: ("bad_request", "Bad request", "That request could not be read. Go back and try again."),
    403: (
        "permission_denied",
        "You don't have access to this page",
        "Your account can't open this page. Ask the chain owner if you need it.",
    ),
    404: (
        "not_found",
        "We couldn't find that page",
        "The address may be mistyped, or the record was moved. Nothing has been changed.",
    ),
    500: (
        "internal_error",
        "Something went wrong",
        "The server hit an error and has logged it. Your last change may not have been saved "
        "— check the record before trying again.",
    ),
}
API_MESSAGES = {404: "Endpoint not found.", 500: "An unexpected error occurred."}


def health(request):
    return JsonResponse({"ok": True})


def robots(request):
    # An internal workspace: nothing here belongs in search results.
    return HttpResponse("User-agent: *\nDisallow: /\n", content_type="text/plain")


def favicon(request):
    return HttpResponseRedirect(static("bos/img/favicon.png"))


def legacy_admin(request, rest=None):
    """The workspace moved from /admin/ to /: keep old bookmarks and links working."""
    query = request.META.get("QUERY_STRING", "")
    return HttpResponsePermanentRedirect(f"/{rest or ''}" + (f"?{query}" if query else ""))


def is_api(request):
    return request.path.startswith("/api/") or request.path == "/health"


def api_error(status, message=None):
    code, title, _ = ERRORS[status]
    message = message or API_MESSAGES.get(status, title + ".")
    return JsonResponse({"error": {"code": code, "message": message, "fields": {}}}, status=status)


def error_page(request, status, message=None):
    """
    Signed-in team members get the error inside the workspace (sidebar, search);
    anyone else gets a plain branded page with a way back to sign-in.
    """
    if is_api(request):
        return api_error(status)
    from django.contrib import admin

    _, title, text = ERRORS[status]
    context = {"code": status, "heading": title, "message": message or text, "title": title}
    user = getattr(request, "user", None)
    if status != 500 and user is not None and admin.site.has_permission(request):
        context = {**admin.site.each_context(request), **context}
        body = render_to_string("admin/error.html", context, request)
    else:
        # No request context or database work: the error may be the database itself.
        body = render_to_string("admin/error_standalone.html", context)
    return HttpResponse(body, status=status)


def bad_request(request, exception):
    return error_page(request, 400)


def permission_denied(request, exception):
    return error_page(request, 403)


def not_found(request, exception):
    return error_page(request, 404)


def server_error(request):
    return error_page(request, 500)


def csrf_failure(request, reason=""):
    return error_page(
        request,
        403,
        "This form expired or was opened in another tab. Go back, reload the page and "
        "submit it again.",
    )


def api_not_found(request, path=""):
    return api_error(404)


class ManagedViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [StaffReadAdminWrite]
    http_method_names = ["get", "post", "patch", "head", "options"]

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        # Serialize concurrent writes to the same record, including its audit snapshot.
        self.get_queryset().select_for_update(of=("self",)).get(pk=self.get_object().pk)
        return super().update(request, *args, **kwargs)

    def perform_create(self, serializer):
        save_managed(serializer, self.request)

    def perform_update(self, serializer):
        save_managed(serializer, self.request)
