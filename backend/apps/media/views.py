from drf_spectacular.utils import extend_schema
from rest_framework import generics
from rest_framework.response import Response

from apps.core.permissions import IsGlobalAdmin
from apps.core.views import ManagedViewSet

from .models import MediaAsset
from .serializers import MediaAssetSerializer, UploadURLSerializer, UploadURLsSerializer
from .services import create_upload_urls, register_asset


class MediaAssetViewSet(ManagedViewSet):
    queryset = MediaAsset.objects.all()
    serializer_class = MediaAssetSerializer
    permission_classes = [IsGlobalAdmin]

    def perform_create(self, serializer):
        register_asset(serializer, self.request)


class UploadURLView(generics.GenericAPIView):
    serializer_class = UploadURLSerializer
    permission_classes = [IsGlobalAdmin]

    @extend_schema(responses=UploadURLsSerializer)
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(create_upload_urls(serializer.validated_data, request))
