from django.apps import AppConfig


class MenuConfig(AppConfig):
    name = "apps.menu"
    # Shown in admin breadcrumbs; the app label (and migrations) stay "menu".
    verbose_name = "Menu"
