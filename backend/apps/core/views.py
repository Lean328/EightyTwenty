from django.db import transaction
from django.http import HttpResponseNotFound, HttpResponseServerError, JsonResponse
from django.template.loader import render_to_string
from rest_framework import mixins, viewsets

from .permissions import StaffReadAdminWrite
from .services import save_managed


def health(request):
    return JsonResponse({"ok": True})


def is_admin_page(request):
    return request.path.startswith("/admin/")


def not_found(request, exception):
    if is_admin_page(request):
        from django.contrib import admin

        context = {**admin.site.each_context(request), "title": "Page not found"}
        return HttpResponseNotFound(render_to_string("admin/404.html", context, request))
    return JsonResponse(
        {"error": {"code": "not_found", "message": "Endpoint not found.", "fields": {}}}, status=404
    )


def server_error(request):
    if is_admin_page(request):
        # No request context or database work here: the error may be the database.
        return HttpResponseServerError(render_to_string("admin/500.html"))
    return JsonResponse(
        {
            "error": {
                "code": "internal_error",
                "message": "An unexpected error occurred.",
                "fields": {},
            }
        },
        status=500,
    )


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
