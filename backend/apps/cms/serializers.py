from urllib.parse import urlsplit

from rest_framework import serializers

from apps.core.models import SiteSettings
from apps.core.serializers import ManagedSerializer

from .models import ContentBlock, NavigationItem, Page


def safe_url(value):
    if value.startswith("/") and not value.startswith("//") and "\\" not in value:
        return value
    parsed = urlsplit(value)
    if parsed.scheme == "https" and parsed.netloc and not parsed.username and "\\" not in value:
        return value
    raise serializers.ValidationError("Use an HTTPS URL or an absolute site path such as /about.")


class PageSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = Page


class ContentBlockSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = ContentBlock

    def validate_content(self, attrs):
        kind = attrs.get("type", getattr(self.instance, "type", None))
        data = attrs.get("data", getattr(self.instance, "data", {}))
        required = {
            "hero": {"title": str},
            "rich_text": {"text": str},
            "image": {"url": str, "alt": str},
            "gallery": {"images": list},
            "cta": {"label": str, "url": str},
            "faq": {"items": list},
        }
        optional = {
            "hero": {"subtitle": str, "image_url": str},
            "rich_text": {},
            "image": {},
            "gallery": {},
            "cta": {},
            "faq": {},
        }
        shape = required.get(kind, {})
        allowed = {**shape, **optional.get(kind, {})}
        if (
            not isinstance(data, dict)
            or set(data) - set(allowed)
            or any(key not in data for key in shape)
            or any(not isinstance(value, allowed[key]) for key, value in data.items())
        ):
            raise serializers.ValidationError(
                {
                    "data": f"Invalid {kind} block. Required fields: {list(shape)}; optional: {list(optional.get(kind, {}))}."
                }
            )
        for key in ["url", "image_url"]:
            if data.get(key):
                safe_url(data[key])
        if kind == "gallery":
            for entry in data["images"]:
                if (
                    not isinstance(entry, dict)
                    or set(entry) != {"url", "alt"}
                    or not all(isinstance(value, str) for value in entry.values())
                ):
                    raise serializers.ValidationError(
                        {"data": "images entries must contain string url and alt."}
                    )
                safe_url(entry["url"])
        if kind == "faq":
            for entry in data["items"]:
                if (
                    not isinstance(entry, dict)
                    or set(entry) != {"question", "answer"}
                    or not all(isinstance(value, str) for value in entry.values())
                ):
                    raise serializers.ValidationError(
                        {"data": "FAQ items require string question and answer."}
                    )
        return attrs

    def validate(self, attrs):
        return super().validate(self.validate_content(attrs))


class NavigationSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = NavigationItem

    def validate(self, attrs):
        url = attrs.get("url", getattr(self.instance, "url", ""))
        page = attrs.get("page", getattr(self.instance, "page", None))
        if bool(url) == bool(page):
            raise serializers.ValidationError("Specify exactly one of url or page.")
        if url:
            safe_url(url)
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        menu = attrs.get("menu", getattr(self.instance, "menu", None))
        seen = {self.instance.pk} if self.instance else set()
        while parent:
            if parent.pk in seen or parent.menu != menu:
                raise serializers.ValidationError(
                    {"parent": "Invalid parent menu or navigation cycle."}
                )
            seen.add(parent.pk)
            parent = parent.parent
        return super().validate(attrs)


class SiteSettingsSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = SiteSettings
        read_only_fields = ManagedSerializer.Meta.read_only_fields + ["menu_version"]

    def validate_social_links(self, value):
        if not isinstance(value, dict) or not all(isinstance(v, str) for v in value.values()):
            raise serializers.ValidationError("Expected a mapping of names to HTTPS URLs.")
        for url in value.values():
            safe_url(url)
        return value

    def validate_order_rules(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected a JSON object.")
        return value
