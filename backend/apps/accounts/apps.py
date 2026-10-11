from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    # Shown in admin breadcrumbs; the app label (and migrations) stay "accounts".
    verbose_name = "People"
