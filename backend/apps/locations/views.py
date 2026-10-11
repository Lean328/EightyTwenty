from apps.core.permissions import is_global, scoped_locations
from apps.core.views import ManagedViewSet

from .models import Location, LocationImage, OpeningHours, SpecialHours
from .serializers import (
    LocationImageSerializer,
    LocationSerializer,
    OpeningHoursSerializer,
    SpecialHoursSerializer,
)


class LocationViewSet(ManagedViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    lookup_field = "slug"
    filterset_fields = ["is_published", "status"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset.none()
        return scoped_locations(self.request.user)


class LocationChildViewSet(ManagedViewSet):
    filterset_fields = ["location"]

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self, "swagger_fake_view", False):
            return qs.none()
        if not is_global(self.request.user):
            qs = qs.filter(location__in=scoped_locations(self.request.user))
        return qs


class LocationImageViewSet(LocationChildViewSet):
    queryset = LocationImage.objects.all()
    serializer_class = LocationImageSerializer


class OpeningHoursViewSet(LocationChildViewSet):
    queryset = OpeningHours.objects.all()
    serializer_class = OpeningHoursSerializer


class SpecialHoursViewSet(LocationChildViewSet):
    queryset = SpecialHours.objects.all()
    serializer_class = SpecialHoursSerializer
