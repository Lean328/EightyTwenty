from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import generics, viewsets
from rest_framework.response import Response

from apps.core.permissions import IsStaff, is_global, scoped_locations
from apps.core.views import ManagedViewSet

from . import serializers as s
from .models import (
    Category,
    DietaryTag,
    LocationMenuItem,
    MenuItem,
    MenuItemModifierGroup,
    ModifierGroup,
    ModifierOption,
)
from .services import save_menu_item, set_availability


class CategoryViewSet(ManagedViewSet):
    queryset = Category.objects.all()
    serializer_class = s.CategorySerializer
    filterset_fields = ["is_active"]


class DietaryTagViewSet(ManagedViewSet):
    queryset = DietaryTag.objects.all()
    serializer_class = s.DietaryTagSerializer


class MenuItemViewSet(ManagedViewSet):
    queryset = MenuItem.objects.select_related("category", "image").prefetch_related(
        "dietary_tags", "modifier_groups"
    )
    serializer_class = s.MenuItemSerializer
    filterset_fields = ["category", "is_published", "is_featured"]
    search_fields = ["name", "slug"]

    def get_queryset(self):
        # Chain items for everyone; café-only items only for that café's team.
        qs = super().get_queryset()
        if is_global(self.request.user):
            return qs
        return qs.filter(
            Q(location__isnull=True) | Q(location__in=scoped_locations(self.request.user))
        )

    def perform_create(self, serializer):
        save_menu_item(serializer, self.request)

    def perform_update(self, serializer):
        save_menu_item(serializer, self.request)


class ModifierGroupViewSet(ManagedViewSet):
    queryset = ModifierGroup.objects.all()
    serializer_class = s.ModifierGroupSerializer


class ModifierOptionViewSet(ManagedViewSet):
    queryset = ModifierOption.objects.all()
    serializer_class = s.ModifierOptionSerializer
    filterset_fields = ["group", "is_active"]


class MenuItemModifierGroupViewSet(ManagedViewSet):
    queryset = MenuItemModifierGroup.objects.all()
    serializer_class = s.MenuItemModifierGroupSerializer
    filterset_fields = ["menu_item", "modifier_group"]


class AvailabilityView(generics.GenericAPIView):
    permission_classes = [IsStaff]
    serializer_class = s.AvailabilitySerializer

    @extend_schema(responses=s.LocationMenuItemSerializer)
    def patch(self, request, slug, item_slug):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rows = set_availability(request, slug, [item_slug], serializer.validated_data)
        return Response(s.LocationMenuItemSerializer(rows[0]).data)


class BulkAvailabilityView(generics.GenericAPIView):
    filter_backends = []
    pagination_class = None
    permission_classes = [IsStaff]
    serializer_class = s.BulkAvailabilitySerializer

    @extend_schema(responses=s.LocationMenuItemSerializer(many=True))
    def post(self, request, slug):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rows = set_availability(
            request,
            slug,
            serializer.validated_data["items"],
            {"is_available": serializer.validated_data["is_available"]},
        )
        return Response(s.LocationMenuItemSerializer(rows, many=True).data)


class LocationMenuItemViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LocationMenuItem.objects.all()
    permission_classes = [IsStaff]
    serializer_class = s.LocationMenuItemSerializer
    filterset_fields = ["location", "menu_item", "is_available", "is_hidden"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset.none()
        return self.queryset.filter(location__in=scoped_locations(self.request.user))
