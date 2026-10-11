from rest_framework import serializers

from apps.core.serializers import InputSerializer, ManagedSerializer

from .models import MediaAsset


class UploadURLSerializer(InputSerializer):
    folder = serializers.ChoiceField(choices=["menu", "locations", "cms", "catering"])
    content_hash = serializers.RegexField(
        r"^[a-f0-9]{64}$",
        help_text="SHA-256 of the source image; server adds an immutable unique path.",
    )


class UploadVariantSerializer(serializers.Serializer):
    path = serializers.CharField()
    upload_url = serializers.URLField()
    public_url = serializers.URLField()


class UploadURLsSerializer(serializers.Serializer):
    receipt = serializers.CharField()
    expires_in = serializers.IntegerField()
    variants = serializers.DictField(child=UploadVariantSerializer())


class MediaAssetSerializer(ManagedSerializer):
    upload_receipt = serializers.CharField(write_only=True, required=False, max_length=4096)

    class Meta(ManagedSerializer.Meta):
        model = MediaAsset
        read_only_fields = ManagedSerializer.Meta.read_only_fields + [
            "storage_path",
            "legacy_path",
            "variants",
            "mime",
            "bytes",
            "uploaded_by",
        ]

    def validate(self, attrs):
        if self.instance is None and not attrs.get("upload_receipt"):
            raise serializers.ValidationError(
                {"upload_receipt": "Request upload URLs and upload all three variants first."}
            )
        if self.instance is not None and "upload_receipt" in attrs:
            raise serializers.ValidationError(
                {"upload_receipt": "Create a new asset to replace image content."}
            )
        return super().validate(attrs)
