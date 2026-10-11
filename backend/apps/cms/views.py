from django.db import transaction
from rest_framework import generics

from apps.core.models import SiteSettings
from apps.core.permissions import StaffReadAdminWrite
from apps.core.services import save_managed
from apps.core.views import ManagedViewSet

from .models import ContentBlock, NavigationItem, Page
from .serializers import (
    ContentBlockSerializer,
    NavigationSerializer,
    PageSerializer,
    SiteSettingsSerializer,
)
from .services import save_page


class PageViewSet(ManagedViewSet):
    queryset = Page.objects.all()
    serializer_class = PageSerializer
    filterset_fields = ["status"]

    def perform_create(self, serializer):
        save_page(serializer, self.request)

    def perform_update(self, serializer):
        save_page(serializer, self.request)


class ContentBlockViewSet(ManagedViewSet):
    queryset = ContentBlock.objects.all()
    serializer_class = ContentBlockSerializer
    filterset_fields = ["page", "type", "is_active"]


class NavigationViewSet(ManagedViewSet):
    queryset = NavigationItem.objects.all()
    serializer_class = NavigationSerializer
    filterset_fields = ["menu", "is_active"]


class SiteSettingsView(generics.RetrieveUpdateAPIView):
    serializer_class = SiteSettingsSerializer
    permission_classes = [StaffReadAdminWrite]
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return SiteSettings.load()

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        SiteSettings.objects.select_for_update().get(pk=self.get_object().pk)
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        save_managed(serializer, self.request)
        serializer.instance.refresh_from_db()
