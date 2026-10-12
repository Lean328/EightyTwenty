"""Mobile app card copy (EightyTwentyMobile fixtures/locations.ts). Fills blanks only."""

from django.db import migrations

COPY = {
    "braddon": ("Lonsdale St", "Wholesome food, great coffee on Lonsdale St."),
    "civic": ("Mort St · Quick Service", "Quick service on Mort Street, weekdays."),
    "coombs": ("Molonglo Valley", "Wholesome food, great coffee in the Molonglo Valley."),
    "greenway": ("Tuggeranong", "Wholesome food, great coffee on the South Side."),
    "gungahlin": ("Up North", "Wholesome food, great coffee, up north in Gungahlin."),
    "dickson": ("Near City", "Wholesome food, great coffee in Dickson, near the city."),
    "belconnen": ("Gluten Free Cafe", "A gluten free café on the North Side."),
    "phillip": ("100% Gluten Free", "100% gluten free, every day."),
    "kingston": ("Rosemary by EightyTwenty", "Rosemary by EightyTwenty, in the Inner South."),
    "akuna": ("Heart of City", "Coming soon to the heart of the city."),
}


def fill(apps, schema_editor):
    Location = apps.get_model("locations", "Location")
    for location in Location.objects.filter(slug__in=COPY):
        area, headline = COPY[location.slug]
        changed = []
        if not location.area:
            location.area = area
            changed.append("area")
        if not location.headline:
            location.headline = headline
            changed.append("headline")
        if changed:
            location.save(update_fields=changed)


class Migration(migrations.Migration):
    dependencies = [
        ("locations", "0005_location_area_location_headline"),
        ("core", "0004_alter_auditlog_options"),
    ]
    operations = [migrations.RunPython(fill, migrations.RunPython.noop)]
