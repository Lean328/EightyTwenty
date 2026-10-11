from django.utils import timezone

from apps.core.services import save_managed


def save_page(serializer, request):
    if serializer.validated_data.get("status") == "published":
        previous = getattr(serializer.instance, "published_at", None)
        if not serializer.validated_data.get("published_at") and not previous:
            serializer.validated_data["published_at"] = timezone.now()
    return save_managed(serializer, request)
