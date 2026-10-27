from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers, viewsets
from rest_framework.response import Response

from apps.notifications.models import EmailMessage

from . import jobs
from .models import AuditLog
from .permissions import HasJobToken, IsGlobalAdmin


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = "__all__"


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.order_by("-created_at", "-id")
    serializer_class = AuditLogSerializer
    permission_classes = [IsGlobalAdmin]
    filterset_fields = ["actor", "action", "entity_type", "entity_id"]


class EmailStatusSerializer(serializers.ModelSerializer):
    attempts = serializers.IntegerField(min_value=0, max_value=32767, read_only=True)

    class Meta:
        model = EmailMessage
        fields = [
            "id",
            "recipient",
            "subject",
            "status",
            "attempts",
            "next_attempt_at",
            "sent_at",
            "last_error",
            "created_at",
        ]


class EmailStatusViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = EmailMessage.objects.order_by("-created_at")
    serializer_class = EmailStatusSerializer
    permission_classes = [IsGlobalAdmin]
    filterset_fields = ["status"]


class JobResultSerializer(serializers.Serializer):
    processed = serializers.IntegerField()


class RetryEmailsView(generics.GenericAPIView):
    authentication_classes = []
    permission_classes = [HasJobToken]
    serializer_class = JobResultSerializer
    throttle_scope = "jobs"

    @extend_schema(request=None, responses=JobResultSerializer, auth=[{"JobToken": []}])
    def post(self, request):
        return Response({"processed": jobs.retry_emails()})


class BookingRemindersView(RetryEmailsView):
    @extend_schema(request=None, responses=JobResultSerializer, auth=[{"JobToken": []}])
    def post(self, request):
        """Email + app reminder for confirmed tables starting in 2–26 hours (once each)."""
        return Response({"processed": jobs.booking_reminders()})


class CleanupView(RetryEmailsView):
    @extend_schema(request=None, responses=JobResultSerializer, auth=[{"JobToken": []}])
    def post(self, request):
        return Response({"processed": jobs.cleanup()})
