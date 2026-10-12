from django.db import models

from apps.core.models import ManagedModel


class Category(ManagedModel):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    # Compact label for the mobile app's category rail ("Coffee"); falls back to the name.
    short_name = models.CharField(max_length=40, blank=True, default="", db_default="")
    note = models.CharField(max_length=300, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta(ManagedModel.Meta):
        ordering = ["sort_order", "slug"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class DietaryTag(ManagedModel):
    code = models.CharField(max_length=40, unique=True)
    label = models.CharField(max_length=80)
    description = models.CharField(max_length=300, blank=True)

    def __str__(self):
        return self.code

    class Meta(ManagedModel.Meta):
        verbose_name = "dietary label"
        verbose_name_plural = "dietary labels"


class ModifierGroup(ManagedModel):
    # Frontend codes such as "add" can recur with different definitions.
    code = models.SlugField()
    name = models.CharField(max_length=120)
    is_required = models.BooleanField(default=False)
    min_select = models.PositiveSmallIntegerField(default=0)
    max_select = models.PositiveSmallIntegerField(default=0)
    import_key = models.CharField(max_length=64, unique=True, null=True, blank=True, editable=False)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.code})"

    class Meta(ManagedModel.Meta):
        constraints = [
            models.CheckConstraint(
                condition=models.Q(max_select=0) | models.Q(max_select__gte=models.F("min_select")),
                name="modifier_selection_bounds",
            )
        ]


class ModifierOption(ManagedModel):
    group = models.ForeignKey(ModifierGroup, on_delete=models.PROTECT, related_name="options")
    name = models.CharField(max_length=120)
    price_delta_cents = models.IntegerField(default=0)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

    class Meta(ManagedModel.Meta):
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["group", "name"], name="unique_modifier_option_name")
        ]


class MenuItem(ManagedModel):
    slug = models.SlugField(unique=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="items")
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    base_price_cents = models.PositiveIntegerField()
    dietary_tags = models.ManyToManyField(DietaryTag, through="MenuItemDietaryTag", blank=True)
    image = models.ForeignKey("media.MediaAsset", null=True, blank=True, on_delete=models.SET_NULL)
    # Empty = sold chain-wide. Set = an item only this café sells (managed by its owner).
    location = models.ForeignKey(
        "locations.Location",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="exclusive_menu_items",
        verbose_name="only at",
        help_text="Leave empty for a chain-wide item; choose a café for an item only it sells.",
    )
    modifier_groups = models.ManyToManyField(ModifierGroup, through="MenuItemModifierGroup")
    is_featured = models.BooleanField(default=False)
    is_published = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    price_source = models.CharField(max_length=60, blank=True)

    class Meta(ManagedModel.Meta):
        ordering = ["sort_order", "slug"]

    def __str__(self):
        return self.name


class MenuItemModifierGroup(ManagedModel):
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE, related_name="modifier_links")
    modifier_group = models.ForeignKey(ModifierGroup, on_delete=models.PROTECT)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.menu_item} / {self.modifier_group}"

    class Meta(ManagedModel.Meta):
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["menu_item", "modifier_group"], name="unique_menu_modifier_group"
            )
        ]


class MenuItemDietaryTag(ManagedModel):
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE, related_name="dietary_links")
    tag = models.ForeignKey(DietaryTag, on_delete=models.PROTECT)
    sort_order = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.menu_item} / {self.tag}"

    class Meta(ManagedModel.Meta):
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["menu_item", "tag"], name="unique_item_dietary_tag")
        ]


class LocationMenuItem(ManagedModel):
    location = models.ForeignKey("locations.Location", on_delete=models.PROTECT)
    menu_item = models.ForeignKey(
        MenuItem, on_delete=models.PROTECT, related_name="location_overrides"
    )
    price_override_cents = models.PositiveIntegerField(null=True, blank=True)
    is_available = models.BooleanField(default=True)
    is_hidden = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.menu_item} / {self.location}"

    class Meta(ManagedModel.Meta):
        verbose_name = "location override"
        verbose_name_plural = "location overrides"
        constraints = [
            models.UniqueConstraint(
                fields=["location", "menu_item"], name="unique_location_menu_item"
            )
        ]
