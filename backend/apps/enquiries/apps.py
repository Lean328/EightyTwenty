from django.apps import AppConfig


class EnquiriesConfig(AppConfig):
    name = "apps.enquiries"
    # Shown in admin breadcrumbs; the app label (and migrations) stay "enquiries".
    verbose_name = "Catering & enquiries"
