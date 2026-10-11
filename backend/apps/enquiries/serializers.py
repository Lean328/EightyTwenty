from django.utils import timezone
from rest_framework import serializers

from apps.core.antispam import AntiSpamMixin
from apps.core.permissions import is_global
from apps.core.serializers import InputSerializer, ManagedSerializer
from apps.locations.models import Location

from .models import CateringPackage, Enquiry


class CateringPackageSerializer(ManagedSerializer):
    items = serializers.ListField(
        child=serializers.CharField(max_length=300), max_length=100, required=False
    )

    class Meta(ManagedSerializer.Meta):
        model = CateringPackage


class PublicEnquirySerializer(AntiSpamMixin, InputSerializer):
    kind = serializers.ChoiceField(choices=["catering", "wholesale", "contact"])
    name = serializers.CharField(max_length=160)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    company = serializers.CharField(max_length=200, required=False, allow_blank=True)
    location = serializers.SlugRelatedField(
        slug_field="slug",
        queryset=Location.objects.filter(is_published=True),
        allow_null=True,
        required=False,
    )
    event_date = serializers.DateField(allow_null=True, required=False)
    headcount = serializers.IntegerField(
        min_value=1, max_value=10000, allow_null=True, required=False
    )
    package = serializers.SlugRelatedField(
        slug_field="slug",
        queryset=CateringPackage.objects.filter(is_active=True),
        allow_null=True,
        required=False,
    )
    message = serializers.CharField(max_length=5000)
    payload = serializers.DictField(child=serializers.CharField(max_length=500), required=False)

    def validate(self, attrs):
        if attrs.get("event_date") and attrs["event_date"] < timezone.localdate():
            raise serializers.ValidationError({"event_date": "Choose today or a future date."})
        if len(attrs.get("payload", {})) > 20:
            raise serializers.ValidationError({"payload": "At most 20 extra fields are allowed."})
        if attrs["kind"] != "catering" and attrs.get("package"):
            raise serializers.ValidationError(
                {"package": "Packages apply to catering enquiries only."}
            )
        return attrs


class EnquiryReceiptSerializer(serializers.Serializer):
    reference = serializers.CharField()


class EnquirySerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = Enquiry
        read_only_fields = [
            f.name
            for f in Enquiry._meta.fields
            if f.name not in {"status", "assigned_to", "internal_notes"}
        ]

    def validate_assigned_to(self, user):
        if user is None:
            return user
        if user.role not in {"owner", "admin", "manager", "staff"} or not user.is_active:
            raise serializers.ValidationError("Choose an active staff member.")
        if not is_global(user) and (
            not self.instance.location_id
            or not user.assignments.filter(
                location_id=self.instance.location_id, is_active=True
            ).exists()
        ):
            raise serializers.ValidationError("This staff member is not assigned to this location.")
        return user
