"""
/api/v1/app/... — one route per path in the app's src/services/api/endpoints.ts.
The app's EXPO_PUBLIC_API_BASE_URL is https://<host>/api/v1/app (no trailing slash).
"""

from django.urls import path

from . import views as v
from . import wallet_views as w

urlpatterns = [
    path("auth/sign-in", v.SignInView.as_view()),
    path("auth/sign-up", v.SignUpView.as_view()),
    path("auth/sign-out", v.SignOutView.as_view()),
    path("auth/refresh", v.RefreshView.as_view()),
    path("auth/password-reset", v.PasswordResetView.as_view()),
    path("me", v.MeView.as_view()),
    path("me/closure-request", v.ClosureRequestView.as_view()),
    path("me/password", v.PasswordView.as_view()),
    path("me/preferences", v.PreferencesView.as_view()),
    path("me/favourites", v.FavouritesView.as_view()),
    path("me/favourites/<str:item_id>", v.FavouriteView.as_view()),
    path("me/addresses", v.AddressesView.as_view()),
    path("me/addresses/<str:address_id>", v.AddressView.as_view()),
    path("me/orders", v.MyOrdersView.as_view()),
    path("me/payment-methods", v.PaymentMethodsView.as_view()),
    path("me/payment-methods/<str:method_id>", v.PaymentMethodView.as_view()),
    path("me/loyalty", v.LoyaltyView.as_view()),
    path("me/loyalty/activity", v.LoyaltyActivityView.as_view()),
    path("me/loyalty/wallet-pass", v.WalletPassView.as_view()),
    path("me/loyalty/wallet-pass/added", v.WalletPassAddedView.as_view()),
    path("me/reservations", v.MyReservationsView.as_view()),
    path("me/catering-enquiries", v.MyEnquiriesView.as_view()),
    path("me/gift-card", v.GiftCardView.as_view()),
    path("me/gift-card/activity", v.GiftActivityView.as_view()),
    path("me/notifications", v.NotificationsView.as_view()),
    path("me/notifications/seen", v.NotificationsSeenView.as_view()),
    path("me/notifications/read-all", v.NotificationsReadAllView.as_view()),
    path("me/push-tokens", v.PushTokensView.as_view()),
    path("me/push-tokens/<str:token>", v.PushTokenView.as_view()),
    path("locations", v.LocationsView.as_view()),
    path("locations/<str:slug>", v.LocationView.as_view()),
    path("locations/<str:slug>/menu", v.LocationMenuView.as_view()),
    path("menu/categories", v.CategoriesView.as_view()),
    path("menu/items/<str:slug>", v.MenuItemView.as_view()),
    path("orders", v.OrdersView.as_view()),
    path("orders/quote", v.OrderQuoteView.as_view()),
    path("orders/<str:order_id>", v.OrderView.as_view()),
    path("reservations", v.ReservationsView.as_view()),
    path("reservations/<str:booking_id>", v.ReservationView.as_view()),
    path("catering/packages", v.CateringPackagesView.as_view()),
    path("catering-enquiries", v.EnquiriesView.as_view()),
    path("gift-cards/send", v.GiftSendView.as_view()),
    path("content/offers", v.OffersView.as_view()),
    path("content/faqs", v.FaqsView.as_view()),
    # Apple Wallet: the pass download, then Apple's pass web service (webServiceURL = …/wallet).
    path("wallet/add", w.AddPageView.as_view()),
    path("wallet/pass", w.PassDownloadView.as_view()),
    path(
        "wallet/v1/devices/<str:device>/registrations/<str:pass_type>/<str:serial>",
        w.RegistrationView.as_view(),
    ),
    path("wallet/v1/devices/<str:device>/registrations/<str:pass_type>", w.UpdatesView.as_view()),
    path("wallet/v1/passes/<str:pass_type>/<str:serial>", w.LatestPassView.as_view()),
    path("wallet/v1/log", w.LogView.as_view()),
]
