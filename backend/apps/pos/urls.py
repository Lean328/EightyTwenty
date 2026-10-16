"""
/api/v1/pos/... — one route per operation of the till's PosBackend (src/services/contracts.ts).
The till's VITE_API_BASE_URL is https://<host> and every path below starts with /api/v1/pos.
"""

from django.urls import path

from . import views as v

urlpatterns = [
    path("locations", v.LocationsView.as_view()),
    path("locations/<slug:slug>/categories", v.CategoriesView.as_view()),
    path("locations/<slug:slug>/menu", v.MenuView.as_view()),
    path("staff/verify-pin", v.VerifyPinView.as_view()),
    path("snapshot", v.SnapshotView.as_view()),
    path("orders", v.OrdersView.as_view()),
    path("orders/<str:order_id>/status", v.OrderStatusView.as_view()),
    path("orders/<str:order_id>/accept", v.AcceptView.as_view()),
    path("orders/<str:order_id>/preparation", v.PreparationView.as_view()),
    path("orders/<str:order_id>/adjustments", v.AdjustmentsView.as_view()),
    path("orders/<str:order_id>/tables", v.TablesView.as_view()),
    path("orders/<str:order_id>/payments", v.PaymentsView.as_view()),
    path("shifts", v.ShiftsView.as_view()),
    path("shifts/<str:shift_id>", v.ShiftView.as_view()),
    path("shifts/<str:shift_id>/moves", v.ShiftMovesView.as_view()),
    path("transactions", v.TransactionsView.as_view()),
    path("audit", v.AuditView.as_view()),
]
