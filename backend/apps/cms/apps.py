from django.apps import AppConfig


class CmsConfig(AppConfig):
    name = "apps.cms"
    # Shown in admin breadcrumbs; the app label (and migrations) stay "cms".
    verbose_name = "Website"
