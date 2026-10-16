from datetime import timedelta

from django.core.management import call_command
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers, viewsets
from rest_framework.response import Response

from apps.notifications.models import EmailMessage
from apps.notifications.services import retry_emails

from .models import AuditLog, RateLimitBucket
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
        return Response({"processed": retry_emails(limit=10)})


class CleanupView(RetryEmailsView):
    @extend_schema(request=None, responses=JobResultSerializer, auth=[{"JobToken": []}])
    def post(self, request):
        call_command("flushexpiredtokens")
        count, _ = RateLimitBucket.objects.filter(
            expires_at__lt=timezone.now() - timedelta(days=1)
        ).delete()
        # Till command receipts only need to outlive the till's retries.
        from apps.pos.models import CommandReceipt

        count += CommandReceipt.objects.filter(
            created_at__lt=timezone.now() - timedelta(days=30)
        ).delete()[0]
        # Account emails contain short-lived reset/verification links; purge their body.
        count += (
            EmailMessage.objects.filter(sent_at__lt=timezone.now() - timedelta(days=7))
            .exclude(body="")
            .update(body="")
        )
        return Response({"processed": count})
