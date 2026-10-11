from django.apps import AppConfig


class BookingsConfig(AppConfig):
    name = "apps.bookings"
    # Shown in admin breadcrumbs; the app label (and migrations) stay "bookings".
    verbose_name = "Reservations"
