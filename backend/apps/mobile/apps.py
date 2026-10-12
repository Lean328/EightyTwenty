from django.apps import AppConfig


class MobileConfig(AppConfig):
    """The customer mobile app REST API (/api/v1/app/...). No models of its own."""

    name = "apps.mobile"
    verbose_name = "Mobile app API"
