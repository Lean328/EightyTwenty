from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


class StrictSerializerMixin:
    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = set(data) - set(self.fields)
            readonly = {key for key in data if key in self.fields and self.fields[key].read_only}
            if unknown | readonly:
                raise serializers.ValidationError(
                    {key: "Unknown or read-only field." for key in sorted(unknown | readonly)}
                )
        return super().to_internal_value(data)


class InputSerializer(StrictSerializerMixin, serializers.Serializer):
    pass


class ManagedSerializer(StrictSerializerMixin, serializers.ModelSerializer):
    def build_standard_field(self, field_name, model_field):
        field_class, kwargs = super().build_standard_field(field_name, model_field)
        bounds = {
            "PositiveSmallIntegerField": (0, 32767),
            "SmallIntegerField": (-32768, 32767),
            "PositiveIntegerField": (0, 2147483647),
            "IntegerField": (-2147483648, 2147483647),
            "PositiveBigIntegerField": (0, 9223372036854775807),
            "BigIntegerField": (-9223372036854775808, 9223372036854775807),
        }
        if (
            field_class is serializers.IntegerField
            and model_field.get_internal_type() in bounds
            and not kwargs.get("read_only")
        ):
            low, high = bounds[model_field.get_internal_type()]
            kwargs["min_value"] = max(low, kwargs.get("min_value", low))
            kwargs["max_value"] = min(high, kwargs.get("max_value", high))
        return field_class, kwargs

    class Meta:
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "created_by", "updated_by"]

    def validate(self, attrs):
        if self.instance and "slug" in attrs and attrs["slug"] != self.instance.slug:
            raise serializers.ValidationError({"slug": "Public slugs are immutable."})
        model = self.Meta.model
        candidate = model()
        if self.instance:
            for field in model._meta.concrete_fields:
                setattr(candidate, field.attname, getattr(self.instance, field.attname))
            candidate._state.adding = False
        for field in model._meta.concrete_fields:
            if field.name in attrs:
                setattr(candidate, field.name, attrs[field.name])
        try:
            candidate.full_clean(
                exclude=["password"], validate_unique=False, validate_constraints=False
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
        return super().validate(attrs)


class MessageSerializer(serializers.Serializer):
    message = serializers.CharField()


class ErrorDetailSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()
    fields = serializers.JSONField()


class ErrorSerializer(serializers.Serializer):
    error = ErrorDetailSerializer()
