from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    name = "apps.notifications"
    # Shown in admin breadcrumbs; the app label (and migrations) stay "notifications".
    verbose_name = "System"
