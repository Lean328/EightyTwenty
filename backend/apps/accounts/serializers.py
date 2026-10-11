from django.contrib.auth.password_validation import validate_password
from django.utils.crypto import constant_time_compare
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.utils import get_md5_hash_password

from apps.core.antispam import AntiSpamMixin
from apps.core.serializers import InputSerializer, ManagedSerializer

from .models import CustomerProfile, StaffAssignment, User


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        attrs["email"] = attrs["email"].strip().lower()
        return super().validate(attrs)


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class RefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        token = self.token_class(attrs["refresh"])
        user = User.objects.filter(pk=token["user_id"], is_active=True).first()
        if not user or not constant_time_compare(
            token.get("hash_password", ""), get_md5_hash_password(user.password)
        ):
            raise InvalidToken("Session has been revoked.")
        return super().validate(attrs)


class ProfileSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "marketing_opt_in",
            "role",
            "email_verified",
            "created_at",
        ]
        read_only_fields = ["id", "email", "role", "email_verified", "created_at"]


class RegisterSerializer(AntiSpamMixin, InputSerializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, max_length=128)
    first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    marketing_opt_in = serializers.BooleanField(default=False)

    def validate(self, attrs):
        attrs["email"] = attrs["email"].lower()
        validate_password(
            attrs["password"],
            User(
                email=attrs["email"],
                first_name=attrs.get("first_name", ""),
                last_name=attrs.get("last_name", ""),
            ),
        )
        if User.objects.filter(email__iexact=attrs["email"]).exists():
            raise serializers.ValidationError({"email": "This email is already registered."})
        return attrs


class EmailRequestSerializer(AntiSpamMixin, InputSerializer):
    email = serializers.EmailField()


class TokenActionSerializer(InputSerializer):
    uid = serializers.CharField(max_length=100)
    token = serializers.CharField(max_length=256)


class ResetConfirmSerializer(TokenActionSerializer):
    password = serializers.CharField(write_only=True, max_length=128)


class LogoutSerializer(InputSerializer):
    refresh = serializers.CharField(max_length=4096)


class UserSerializer(ManagedSerializer):
    password = serializers.CharField(write_only=True, required=False, max_length=128)

    class Meta(ManagedSerializer.Meta):
        model = User
        fields = [
            "id",
            "email",
            "password",
            "first_name",
            "last_name",
            "phone",
            "role",
            "is_active",
            "email_verified",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "email_verified", "created_at", "updated_at"]

    def validate(self, attrs):
        actor = self.context["request"].user
        if (
            self.instance
            and (self.instance.is_superuser or self.instance.role == "owner")
            and actor.role != "owner"
        ):
            raise serializers.ValidationError("Only an owner may edit another owner.")
        if attrs.get("role") == "owner" and actor.role != "owner":
            raise serializers.ValidationError({"role": "Only owners may grant owner access."})
        if self.instance == actor and (
            attrs.get("is_active") is False or attrs.get("role", actor.role) != actor.role
        ):
            raise serializers.ValidationError("You cannot disable or demote your own account.")
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Required for a new user."})
        if "email" in attrs:
            attrs["email"] = attrs["email"].lower()
        if "password" in attrs:
            validate_password(
                attrs["password"], self.instance or User(email=attrs.get("email", ""))
            )
        # User is not a ManagedModel; password handling belongs to the service.
        return attrs


class StaffAssignmentSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = StaffAssignment

    def validate_user(self, user):
        if user.role not in {"owner", "admin", "manager", "staff"} or not user.is_active:
            raise serializers.ValidationError("Assign an active staff user.")
        return user


class CustomerProfileSerializer(ManagedSerializer):
    class Meta(ManagedSerializer.Meta):
        model = CustomerProfile
        fields = ["id", "preferred_location", "birthday"]

    def validate_preferred_location(self, location):
        if location and not location.is_published:
            raise serializers.ValidationError("Choose a published location.")
        return location
