from rest_framework import serializers

from apps.core.serializers import InputSerializer, ManagedSerializer

from .models import (
    Category,
    DietaryTag,
    LocationMenuItem,
    MenuItem,
    MenuItemModifierGroup,
    ModifierGroup,
    ModifierOption,
)


class CategorySerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = Category


class DietaryTagSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = DietaryTag


class ModifierGroupSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = ModifierGroup
        read_only_fields = ManagedSerializer.Meta.read_only_fields + ["import_key"]

    def validate(self, attrs):
        minimum = attrs.get("min_select", getattr(self.instance, "min_select", 0))
        maximum = attrs.get("max_select", getattr(self.instance, "max_select", 0))
        required = attrs.get("is_required", getattr(self.instance, "is_required", False))
        if maximum and maximum < minimum:
            raise serializers.ValidationError(
                {"max_select": "Must be zero (unlimited) or at least min_select."}
            )
        if required and minimum < 1:
            raise serializers.ValidationError(
                {"min_select": "Required groups must require at least one option."}
            )
        return super().validate(attrs)


class ModifierOptionSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = ModifierOption


class MenuItemSerializer(ManagedSerializer):
    dietary_tags = serializers.PrimaryKeyRelatedField(
        queryset=DietaryTag.objects.all(), many=True, required=False
    )

    class Meta(ManagedSerializer.Meta):
        model = MenuItem
        read_only_fields = ManagedSerializer.Meta.read_only_fields + ["modifier_groups"]


class MenuItemModifierGroupSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = MenuItemModifierGroup


class AvailabilitySerializer(InputSerializer):
    is_available = serializers.BooleanField(required=False)
    price_override_cents = serializers.IntegerField(min_value=0, allow_null=True, required=False)
    is_hidden = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide at least one field.")
        return attrs


class LocationMenuItemSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = LocationMenuItem


class BulkAvailabilitySerializer(InputSerializer):
    items = serializers.ListField(child=serializers.SlugField(), min_length=1, max_length=100)
    is_available = serializers.BooleanField()

    def validate_items(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Duplicate items.")
        return value
