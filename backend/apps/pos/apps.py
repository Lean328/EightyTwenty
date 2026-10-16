from django.apps import AppConfig


class PosConfig(AppConfig):
    """The till (POS + kitchen display) REST API (/api/v1/pos/...), cash shifts and till records."""

    name = "apps.pos"
    verbose_name = "Tills"
