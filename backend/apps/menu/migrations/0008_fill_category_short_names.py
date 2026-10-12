"""Compact rail labels from the mobile app (fixtures/menu.ts CATEGORY_SHORT_NAMES). Blanks only."""

from django.db import migrations

SHORT = {
    "allday": "All Day",
    "acai": "Açai",
    "salads": "Salads",
    "burgers": "Burgers",
    "bites": "Bites",
    "kids": "Kids",
    "addons": "Add Ons",
    "takeaway": "Takeaway",
    "coffee": "Coffee",
    "cold": "Cold Drinks",
    "smoothies": "Smoothies",
    "juices": "Juices",
}


def fill(apps, schema_editor):
    Category = apps.get_model("menu", "Category")
    for category in Category.objects.filter(slug__in=SHORT, short_name=""):
        category.short_name = SHORT[category.slug]
        category.save(update_fields=["short_name"])


class Migration(migrations.Migration):
    dependencies = [("menu", "0007_category_short_name"), ("core", "0004_alter_auditlog_options")]
    operations = [migrations.RunPython(fill, migrations.RunPython.noop)]
