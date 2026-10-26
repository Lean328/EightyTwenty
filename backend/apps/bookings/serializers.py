from rest_framework import serializers

from apps.core.antispam import AntiSpamMixin
from apps.core.serializers import InputSerializer, ManagedSerializer
from apps.locations.services import public_locations

from .models import Booking, BookingRule


class BookingRuleSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = BookingRule

    def validate(self, attrs):
        maximum = attrs.get("max_party_size", getattr(self.instance, "max_party_size", 10))
        capacity = attrs.get(
            "max_covers_per_slot", getattr(self.instance, "max_covers_per_slot", 20)
        )
        if maximum > capacity:
            raise serializers.ValidationError(
                {"max_party_size": "Cannot exceed max_covers_per_slot."}
            )
        return super().validate(attrs)


class PublicBookingSerializer(AntiSpamMixin, InputSerializer):
    location = serializers.SlugRelatedField(slug_field="slug", queryset=public_locations())
    date = serializers.DateField()
    time = serializers.TimeField()
    party_size = serializers.IntegerField(min_value=1, max_value=1000)
    name = serializers.CharField(max_length=160)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=32)
    notes = serializers.CharField(max_length=3000, allow_blank=True, required=False)
    seating = serializers.ChoiceField(
        choices=["indoor", "outdoor"], required=False, default="", allow_blank=True
    )
    source = serializers.ChoiceField(choices=["web", "app"], default="web")


class BookingReceiptSerializer(serializers.Serializer):
    reference = serializers.CharField()
    status = serializers.ChoiceField(choices=["requested"])


class BookingSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = Booking
        read_only_fields = [
            f.name for f in Booking._meta.fields if f.name not in {"status", "notes"}
        ]


class MyBookingSerializer(serializers.ModelSerializer):
    party_size = serializers.IntegerField(min_value=1, max_value=32767, read_only=True)

    location = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = Booking
        fields = [
            "id",
            "reference",
            "location",
            "date",
            "time",
            "party_size",
            "name",
            "status",
            "notes",
            "created_at",
        ]


class AvailabilityQuerySerializer(InputSerializer):
    location = serializers.SlugRelatedField(slug_field="slug", queryset=public_locations())
    date = serializers.DateField()


class BookingSlotSerializer(serializers.Serializer):
    time = serializers.TimeField()
    remaining_covers = serializers.IntegerField()
    max_party_size = serializers.IntegerField()
