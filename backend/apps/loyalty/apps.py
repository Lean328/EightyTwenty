from django.apps import AppConfig


class LoyaltyConfig(AppConfig):
    name = "apps.loyalty"
    verbose_name = "Loyalty & gift cards"

    def ready(self):
        from .wallet import connect_signals

        connect_signals()
