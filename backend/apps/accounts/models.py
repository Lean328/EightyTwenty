from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from apps.core.models import BaseModel, ManagedModel


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.update(is_staff=True, is_superuser=True, role="owner")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, BaseModel):
    class Role(models.TextChoices):
        OWNER = "owner"
        ADMIN = "admin"
        MANAGER = "manager"
        STAFF = "staff"
        CUSTOMER = "customer"

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.CUSTOMER)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    email_verified = models.BooleanField(default=False)
    marketing_opt_in = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    # 4-digit till PIN, stored as a keyed hash (apps.pos.pins); empty = cannot sign in at a till.
    pos_pin = models.CharField(max_length=64, blank=True, editable=False)
    objects = UserManager()
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(Lower("email"), name="unique_email_case_insensitive")
        ]

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.email

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self):
        return self.first_name


class Customer(User):
    """App customers, listed apart from the team in the workspace (same table as User)."""

    class Meta:
        proxy = True
        verbose_name = "customer"
        verbose_name_plural = "customers"


class StaffAssignment(ManagedModel):
    def __str__(self):
        return f"{self.user} / {self.location}"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="assignments")
    location = models.ForeignKey("locations.Location", on_delete=models.PROTECT)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "team assignment"
        verbose_name_plural = "team assignments"
        constraints = [
            models.UniqueConstraint(fields=["user", "location"], name="unique_staff_location")
        ]


class CustomerProfile(ManagedModel):
    def __str__(self):
        return str(self.user)

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    preferred_location = models.ForeignKey(
        "locations.Location", null=True, blank=True, on_delete=models.SET_NULL
    )
    birthday = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    # Mobile app settings (dietary, notification and security toggles, avatar), merged
    # over APP_PREFERENCE_DEFAULTS. Nullable so code still running during a deploy can insert.
    app_preferences = models.JSONField(null=True, blank=True)
    favourite_items = models.JSONField(null=True, blank=True, help_text="Menu item slugs.")
    notifications_seen_at = models.DateTimeField(null=True, blank=True)
    closure_requested_at = models.DateTimeField(null=True, blank=True)


class SavedAddress(BaseModel):
    def __str__(self):
        return self.line

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses")
    label = models.CharField(
        max_length=5, choices=[("home", "Home"), ("work", "Work"), ("other", "Other")]
    )
    line = models.CharField(max_length=300)

    class Meta(BaseModel.Meta):
        verbose_name = "saved address"
        verbose_name_plural = "saved addresses"
