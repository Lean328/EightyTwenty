from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, permissions
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response

from apps.core.antispam import verify_form
from apps.core.permissions import IsStaff, is_global, scoped_locations
from apps.core.views import ManagedViewSet

from .models import CateringPackage, Enquiry
from .serializers import (
    CateringPackageSerializer,
    EnquiryReceiptSerializer,
    EnquirySerializer,
    PublicEnquirySerializer,
)
from .services import create_enquiry


class CateringPackageViewSet(ManagedViewSet):
    queryset = CateringPackage.objects.select_related("image")
    serializer_class = CateringPackageSerializer


class PublicEnquiryView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    serializer_class = PublicEnquirySerializer
    throttle_scope = "forms"

    @extend_schema(responses={201: EnquiryReceiptSerializer})
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        verify_form(data, request)
        return Response(EnquiryReceiptSerializer(create_enquiry(data)).data, status=201)


@extend_schema_view(
    list=extend_schema(parameters=[OpenApiParameter("location", str, description="Location slug")])
)
class EnquiryViewSet(ManagedViewSet):
    queryset = Enquiry.objects.all()
    serializer_class = EnquirySerializer
    permission_classes = [IsStaff]
    filterset_fields = ["kind", "status", "assigned_to"]
    search_fields = ["reference", "name", "email"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset.none()
        qs = self.queryset
        if not is_global(self.request.user):
            qs = qs.filter(location__in=scoped_locations(self.request.user))
        if self.request.query_params.get("location"):
            qs = qs.filter(location__slug=self.request.query_params["location"])
        return qs

    @extend_schema(exclude=True)
    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed("POST")
