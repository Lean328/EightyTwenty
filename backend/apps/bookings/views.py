from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.antispam import verify_form
from apps.core.permissions import IsStaff, scoped_locations
from apps.core.views import ManagedViewSet
from apps.locations.views import LocationChildViewSet

from . import serializers as s
from .models import Booking, BookingRule
from .services import available_slots, create_booking, update_booking


class PublicBookingView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = s.PublicBookingSerializer
    throttle_scope = "forms"

    @extend_schema(responses={201: s.BookingReceiptSerializer})
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        verify_form(data, request)
        booking = create_booking(data, request.user if request.user.is_authenticated else None)
        return Response(s.BookingReceiptSerializer(booking).data, status=201)


class PublicAvailabilityView(generics.GenericAPIView):
    filter_backends = []
    pagination_class = None
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    serializer_class = s.BookingSlotSerializer

    @extend_schema(
        parameters=[s.AvailabilityQuerySerializer], responses=s.BookingSlotSerializer(many=True)
    )
    def get(self, request):
        query = s.AvailabilityQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        return Response(
            s.BookingSlotSerializer(available_slots(**query.validated_data), many=True).data
        )


class BookingRuleViewSet(LocationChildViewSet):
    queryset = BookingRule.objects.all()
    serializer_class = s.BookingRuleSerializer


@extend_schema_view(
    list=extend_schema(parameters=[OpenApiParameter("location", str, description="Location slug")])
)
class BookingViewSet(ManagedViewSet):
    queryset = Booking.objects.select_related("location")
    serializer_class = s.BookingSerializer
    permission_classes = [IsStaff]
    filterset_fields = {
        "location__slug": ["exact"],
        "date": ["exact", "gte", "lte"],
        "status": ["exact"],
    }
    search_fields = ["reference", "name", "email"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset.none()
        qs = self.queryset.filter(location__in=scoped_locations(self.request.user))
        if self.request.query_params.get("location"):
            qs = qs.filter(location__slug=self.request.query_params["location"])
        return qs

    @extend_schema(exclude=True)
    def create(self, request, *args, **kwargs):
        from rest_framework.exceptions import MethodNotAllowed

        raise MethodNotAllowed("POST")

    def perform_update(self, serializer):
        serializer.instance = update_booking(
            serializer.instance, serializer.validated_data, self.request
        )

    @extend_schema(request=None, responses=s.BookingSerializer)
    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        return Response(
            self.get_serializer(
                update_booking(self.get_object(), {"status": "confirmed"}, request)
            ).data
        )

    @extend_schema(request=None, responses=s.BookingSerializer)
    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        return Response(
            self.get_serializer(
                update_booking(self.get_object(), {"status": "declined"}, request)
            ).data
        )


class MyBookingsView(generics.ListAPIView):
    serializer_class = s.MyBookingSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Booking.objects.none()
        return (
            Booking.objects.filter(customer=self.request.user)
            .select_related("location")
            .order_by("-created_at")
        )
