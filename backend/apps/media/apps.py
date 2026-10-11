from django.apps import AppConfig


class MediaConfig(AppConfig):
    name = "apps.media"
    # Shown in admin breadcrumbs; the app label (and migrations) stay "media".
    verbose_name = "Website"
