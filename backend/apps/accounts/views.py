from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.core.antispam import verify_form
from apps.core.permissions import IsGlobalAdmin
from apps.core.serializers import MessageSerializer
from apps.core.views import ManagedViewSet

from . import services
from .models import CustomerProfile, StaffAssignment, User
from .serializers import (
    CustomerProfileSerializer,
    EmailRequestSerializer,
    LogoutSerializer,
    ProfileSerializer,
    RegisterSerializer,
    ResetConfirmSerializer,
    StaffAssignmentSerializer,
    TokenActionSerializer,
    TokenPairSerializer,
    UserSerializer,
)


class LoginView(TokenObtainPairView):
    throttle_scope = "auth"

    @extend_schema(responses=TokenPairSerializer)
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class RefreshView(TokenRefreshView):
    throttle_scope = "auth"

    @extend_schema(responses=TokenPairSerializer)
    @transaction.atomic
    def post(self, request, *args, **kwargs):
        # Serialize refresh rotation to reject concurrent replay of the same token.
        try:
            token = RefreshToken(request.data.get("refresh", ""))
            User.objects.select_for_update().filter(pk=token["user_id"]).first()
        except TokenError as exc:
            raise InvalidToken(str(exc)) from exc
        return super().post(request, *args, **kwargs)


class RegisterView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    serializer_class = RegisterSerializer
    throttle_scope = "auth"

    @extend_schema(responses={201: ProfileSerializer})
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        verify_form(data, request)
        user = services.register(data)
        return Response(ProfileSerializer(user).data, status=201)


class LogoutView(generics.GenericAPIView):
    serializer_class = LogoutSerializer

    @extend_schema(responses={204: None})
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            if str(token["user_id"]) != str(request.user.pk):
                raise InvalidToken("This token belongs to another user.")
            token.blacklist()
        except TokenError as exc:
            raise InvalidToken(str(exc)) from exc
        return Response(status=204)


class PasswordResetView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    serializer_class = EmailRequestSerializer
    throttle_scope = "auth"
    link_kind = "reset-password"

    @extend_schema(responses=MessageSerializer)
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        verify_form(data, request)
        user = User.objects.filter(email__iexact=data["email"], is_active=True).first()
        if user:
            services.send_account_link(user, self.link_kind)
        return Response({"message": "If the account exists, an email will be sent."})


class VerificationRequestView(PasswordResetView):
    link_kind = "verify-email"


class ResetConfirmView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    serializer_class = ResetConfirmSerializer
    throttle_scope = "auth"

    @extend_schema(responses=MessageSerializer)
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.reset_password(serializer.validated_data)
        return Response({"message": "Password updated."})


class VerifyEmailView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    serializer_class = TokenActionSerializer
    throttle_scope = "auth"

    @extend_schema(responses=MessageSerializer)
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.verify_email(serializer.validated_data)
        return Response({"message": "Email verified."})


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_object(self):
        return self.request.user

    @extend_schema(responses={204: None})
    def delete(self, request):
        services.anonymize(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomerProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = CustomerProfileSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return CustomerProfile.objects.get_or_create(user=self.request.user)[0]


class UserViewSet(ManagedViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsGlobalAdmin]
    filterset_fields = ["role", "is_active"]
    search_fields = ["email", "first_name", "last_name"]

    def perform_create(self, serializer):
        services.save_user(serializer, self.request)

    def perform_update(self, serializer):
        services.save_user(serializer, self.request)


class StaffAssignmentViewSet(ManagedViewSet):
    queryset = StaffAssignment.objects.select_related("user", "location")
    serializer_class = StaffAssignmentSerializer
    permission_classes = [IsGlobalAdmin]
    filterset_fields = ["user", "location", "is_active"]
