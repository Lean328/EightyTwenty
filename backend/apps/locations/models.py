from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import ManagedModel


class Location(ManagedModel):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    subtitle = models.CharField(max_length=240, blank=True)
    address = models.CharField(max_length=500, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    lat = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    lng = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )
    note = models.TextField(blank=True)
    wait_text = models.CharField(max_length=120, blank=True)
    booking_label = models.CharField(max_length=120, blank=True)
    external_order_url = models.URLField(blank=True)
    status = models.CharField(
        max_length=10,
        choices=[("open", "Open"), ("closed", "Closed"), ("tbc", "TBC")],
        default="open",
    )
    fulfilment_methods = models.JSONField(default=list, blank=True)
    is_flagship = models.BooleanField(default=False)
    is_gluten_free = models.BooleanField(default=False)
    is_limited_menu = models.BooleanField(default=False)
    hours_text = models.TextField(blank=True)
    hours_short_text = models.CharField(max_length=200, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=False)

    class Meta(ManagedModel.Meta):
        ordering = ["sort_order", "slug"]

    def __str__(self):
        return self.name

    def clean(self):
        if not isinstance(self.fulfilment_methods, list) or any(
            value not in {"pickup", "delivery", "dine_in"} for value in self.fulfilment_methods
        ):
            raise ValidationError(
                {"fulfilment_methods": "Use a list of pickup, delivery or dine_in."}
            )


class LocationImage(ManagedModel):
    def __str__(self):
        return f"{self.location} / Image {self.position + 1}"

    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="images")
    asset = models.ForeignKey("media.MediaAsset", on_delete=models.PROTECT)
    position = models.PositiveSmallIntegerField(validators=[MaxValueValidator(2)])
    is_active = models.BooleanField(default=True)

    class Meta(ManagedModel.Meta):
        verbose_name = "location photo"
        verbose_name_plural = "location photos"
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(
                fields=["location", "position"], name="unique_location_image_position"
            ),
            models.CheckConstraint(
                condition=models.Q(position__lte=2), name="location_three_images"
            ),
        ]


class HoursBase(ManagedModel):
    opens_at = models.TimeField(null=True, blank=True)
    closes_at = models.TimeField(null=True, blank=True)
    is_closed = models.BooleanField(default=False)

    class Meta(ManagedModel.Meta):
        abstract = True
        constraints = [
            models.CheckConstraint(
                condition=models.Q(is_closed=True)
                | (
                    models.Q(opens_at__isnull=False, closes_at__isnull=False)
                    & models.Q(closes_at__gt=models.F("opens_at"))
                ),
                name="%(class)s_valid_hours",
            )
        ]


class OpeningHours(HoursBase):
    def __str__(self):
        return f"{self.location} / {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][self.weekday]}"

    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="opening_hours")
    weekday = models.PositiveSmallIntegerField(validators=[MaxValueValidator(6)])

    class Meta(HoursBase.Meta):
        verbose_name_plural = "opening hours"
        constraints = HoursBase.Meta.constraints + [
            models.UniqueConstraint(fields=["location", "weekday"], name="unique_location_weekday"),
            models.CheckConstraint(condition=models.Q(weekday__lte=6), name="weekday_range"),
        ]


class SpecialHours(HoursBase):
    def __str__(self):
        return f"{self.location} / {self.date}"

    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="special_hours")
    date = models.DateField()
    reason = models.CharField(max_length=240, blank=True)

    class Meta(HoursBase.Meta):
        verbose_name_plural = "special hours"
        constraints = HoursBase.Meta.constraints + [
            models.UniqueConstraint(
                fields=["location", "date"], name="unique_location_special_date"
            )
        ]
