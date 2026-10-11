from django.apps import AppConfig


class LocationsConfig(AppConfig):
    name = "apps.locations"
    # Shown in admin breadcrumbs; the app label (and migrations) stay "locations".
    verbose_name = "Cafés"
