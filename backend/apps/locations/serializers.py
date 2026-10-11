from rest_framework import serializers

from apps.core.serializers import ManagedSerializer

from .models import Location, LocationImage, OpeningHours, SpecialHours


class LocationSerializer(ManagedSerializer):
    fulfilment_methods = serializers.ListField(
        child=serializers.ChoiceField(choices=["pickup", "delivery", "dine_in"]),
        required=False,
        max_length=3,
    )

    class Meta(ManagedSerializer.Meta):
        model = Location

    def validate_fulfilment_methods(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Duplicate fulfilment methods.")
        return value


class LocationImageSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = LocationImage


class HoursSerializer(ManagedSerializer):
    def validate(self, attrs):
        data = {
            key: attrs.get(key, getattr(self.instance, key, None))
            for key in ["is_closed", "opens_at", "closes_at"]
        }
        if not data["is_closed"] and (
            not data["opens_at"] or not data["closes_at"] or data["opens_at"] >= data["closes_at"]
        ):
            raise serializers.ValidationError(
                "Open hours must have opens_at < closes_at on the same local day."
            )
        return super().validate(attrs)


class OpeningHoursSerializer(HoursSerializer):
    class Meta(ManagedSerializer.Meta):
        model = OpeningHours


class SpecialHoursSerializer(HoursSerializer):
    class Meta(ManagedSerializer.Meta):
        model = SpecialHours
