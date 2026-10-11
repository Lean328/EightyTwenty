from django.db import models

from apps.core.models import ManagedModel


class Page(ManagedModel):
    slug = models.SlugField(unique=True)
    title = models.CharField(max_length=200)
    seo_title = models.CharField(max_length=200, blank=True)
    seo_description = models.TextField(blank=True)
    status = models.CharField(
        max_length=12, choices=[("draft", "Draft"), ("published", "Published")], default="draft"
    )
    published_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.title


class ContentBlock(ManagedModel):
    def __str__(self):
        return f"{self.page} / {self.key}"

    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="blocks")
    key = models.SlugField()
    type = models.CharField(
        max_length=20,
        choices=[(v, v) for v in ["hero", "rich_text", "image", "gallery", "cta", "faq"]],
    )
    data = models.JSONField(default=dict)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta(ManagedModel.Meta):
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["page", "key"], name="unique_page_block_key")
        ]


class NavigationItem(ManagedModel):
    def __str__(self):
        return self.label

    menu = models.CharField(max_length=10, choices=[("header", "Header"), ("footer", "Footer")])
    label = models.CharField(max_length=120)
    url = models.CharField(max_length=500, blank=True)
    page = models.ForeignKey(Page, null=True, blank=True, on_delete=models.PROTECT)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta(ManagedModel.Meta):
        ordering = ["sort_order", "id"]
