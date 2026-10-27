from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.utils.http import parse_etags
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, permissions
from rest_framework.response import Response

from apps.locations.services import public_locations

from . import public_serializers as s
from . import public_services as services
from .models import SiteSettings


class PublicReadView(generics.GenericAPIView):
    filter_backends = []
    pagination_class = None
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def location(self):
        slug = self.request.query_params.get("location")
        return get_object_or_404(public_locations(), slug=slug) if slug else None


class BootstrapView(PublicReadView):
    serializer_class = s.BootstrapSerializer

    @extend_schema(
        parameters=[
            OpenApiParameter("location", str, description="Optional location slug, e.g. braddon")
        ],
        responses={200: s.BootstrapSerializer, 304: None},
    )
    def get(self, request):
        location = self.location()
        settings = SiteSettings.load()
        visible_at = services.published_pages().aggregate(latest=Max("published_at"))["latest"]
        schedule_key = int(visible_at.timestamp()) if visible_at else 0
        etag = f'W/"bootstrap-v2-{settings.menu_version}-{location.slug if location else "all"}-{schedule_key}"'
        # Weak comparison is appropriate: generatedAt changes, menu content does not.
        tags = parse_etags(request.headers.get("If-None-Match", ""))
        match = "*" in tags or any(
            tag.removeprefix("W/") == etag.removeprefix("W/") for tag in tags
        )
        response = (
            Response(status=304)
            if match
            else Response(self.get_serializer(services.bootstrap(location, settings)).data)
        )
        response["ETag"] = etag
        response["Cache-Control"] = "public, max-age=60, stale-while-revalidate=600"
        return response


class PublicLocationsView(PublicReadView):
    serializer_class = s.PublicLocationSerializer

    @extend_schema(responses=s.PublicLocationSerializer(many=True))
    def get(self, request):
        return Response(self.get_serializer(services.locations_data(), many=True).data)


class PublicLocationView(PublicReadView):
    serializer_class = s.PublicLocationSerializer

    def get(self, request, slug):
        get_object_or_404(public_locations(), slug=slug)
        return Response(self.get_serializer(services.locations_data(slug)[0]).data)


class PublicMenuView(PublicReadView):
    serializer_class = s.PublicMenuItemSerializer

    @extend_schema(
        parameters=[OpenApiParameter("location", str)],
        responses=s.PublicMenuItemSerializer(many=True),
    )
    def get(self, request):
        return Response(self.get_serializer(services.menu_data(self.location()), many=True).data)


class PublicCategoriesView(PublicReadView):
    serializer_class = s.PublicCategorySerializer

    @extend_schema(responses=s.PublicCategorySerializer(many=True))
    def get(self, request):
        return Response(self.get_serializer(services.categories_data(), many=True).data)


class PublicCateringView(PublicReadView):
    serializer_class = s.PublicCateringSerializer

    @extend_schema(responses=s.PublicCateringSerializer(many=True))
    def get(self, request):
        return Response(self.get_serializer(services.catering_data(), many=True).data)


class PublicSettingsView(PublicReadView):
    serializer_class = s.PublicSettingsSerializer

    def get(self, request):
        return Response(self.get_serializer(services.settings_data()).data)


class PublicVersionView(PublicReadView):
    serializer_class = s.VersionSerializer

    def get(self, request):
        return Response(
            {"version": SiteSettings.load().menu_version}, headers={"Cache-Control": "no-cache"}
        )


class PublicPageView(PublicReadView):
    serializer_class = s.PublicPageSerializer

    def get(self, request, slug):
        page = get_object_or_404(services.published_pages(), slug=slug)
        return Response(
            self.get_serializer(
                {
                    "slug": page.slug,
                    "title": page.title,
                    "seo_title": page.seo_title,
                    "seo_description": page.seo_description,
                    "blocks": page.blocks.filter(is_active=True),
                }
            ).data
        )
