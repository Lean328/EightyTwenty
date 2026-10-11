"""Read-only operational reporting. All dates follow the business timezone."""

from datetime import datetime, time, timedelta
from urllib.parse import urlencode

from django.db.models import Count, Q, Sum
from django.http import Http404
from django.urls import reverse
from django.utils import timezone

from apps.bookings.models import Booking
from apps.enquiries.models import Enquiry
from apps.menu.models import LocationMenuItem, MenuItem
from apps.notifications.models import EmailMessage

from .bos_access import bos_location_ids, bos_locations
from .charts import column_chart, delta
from .models import AuditLog


def list_url(app, model, **filters):
    url = reverse(f"admin:{app}_{model}_changelist")
    return f"{url}?{urlencode(filters)}" if filters else url


def change_url(obj):
    return reverse(f"admin:{obj._meta.app_label}_{obj._meta.model_name}_change", args=[obj.pk])


def dashboard_context(request):
    today = timezone.localdate()
    days = {"7": 7, "14": 14, "30": 30}.get(request.GET.get("period", "7"), 7)
    start = today - timedelta(days=days - 1)
    previous_start = start - timedelta(days=days)
    locations = list(bos_locations(request.user).order_by("sort_order", "name"))
    ids = bos_location_ids(request.user)  # None = the chain owner, every café
    selected_slug = request.GET.get("location", "")
    selected = next((location for location in locations if location.slug == selected_slug), None)
    if selected_slug and selected is None:
        raise Http404("Unknown location")
    bookings = Booking.objects.all()
    enquiries = Enquiry.objects.all()
    overrides = LocationMenuItem.objects.filter(
        menu_item__is_published=True, menu_item__category__is_active=True, is_hidden=False
    )
    scope = {"location__id__exact": str(selected.pk)} if selected else {}
    if selected:
        bookings = bookings.filter(location=selected)
        enquiries = enquiries.filter(location=selected)
        overrides = overrides.filter(location=selected)
    elif ids is not None:
        bookings = bookings.filter(location__in=ids)
        enquiries = enquiries.filter(location__in=ids)
        overrides = overrides.filter(location__in=ids)

    active = bookings.exclude(status__in=["declined", "cancelled", "no_show"])
    totals = active.aggregate(
        today_bookings=Count("id", filter=Q(date=today)),
        today_covers=Sum("party_size", filter=Q(date=today)),
        period_bookings=Count("id", filter=Q(date__range=(start, today))),
        previous_bookings=Count("id", filter=Q(date__gte=previous_start, date__lt=start)),
    )
    # Past unattended requests remain visible rather than disappearing at midnight.
    pending = bookings.filter(status="requested")
    new_enquiries = enquiries.filter(status="new")
    awaiting_count, enquiry_count = pending.count(), new_enquiries.count()
    unavailable_count = overrides.filter(is_available=False).count()
    published_menu = MenuItem.objects.filter(is_published=True, category__is_active=True)
    if selected:
        published_menu = published_menu.filter(Q(location__isnull=True) | Q(location=selected))
    elif ids is not None:
        published_menu = published_menu.filter(Q(location__isnull=True) | Q(location__in=ids))
    if selected:
        published_menu = published_menu.exclude(
            pk__in=LocationMenuItem.objects.filter(location=selected, is_hidden=True).values(
                "menu_item_id"
            )
        )
    previous = totals["previous_bookings"]
    difference = totals["period_bookings"] - previous
    comparison = (
        f"{difference:+d} vs previous {days} days"
        if previous
        else "No bookings in the previous period"
    )
    trend_delta = delta(totals["period_bookings"], previous)

    daily = {
        row["date"]: row["count"]
        for row in active.filter(date__range=(start, today))
        .values("date")
        .annotate(count=Count("id"))
    }
    peak = max(daily.values(), default=0)
    trend = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        count = daily.get(day, 0)
        trend.append(
            {
                "date": day,
                "count": count,
                "height": round(count * 100 / peak) if peak else 0,
                "today": day == today,
                "show_label": days <= 14 or offset % 5 == 0 or offset == days - 1,
            }
        )

    midnight = timezone.make_aware(datetime.combine(start, time.min))
    tomorrow = timezone.make_aware(datetime.combine(today + timedelta(days=1), time.min))
    by_kind = {
        row["kind"]: row["count"]
        for row in enquiries.filter(created_at__gte=midnight, created_at__lt=tomorrow)
        .values("kind")
        .annotate(count=Count("id"))
    }
    total_enquiries = sum(by_kind.values())
    enquiry_breakdown = [
        {
            "name": label,
            "kind": kind,
            "count": by_kind.get(kind, 0),
            "width": round(by_kind.get(kind, 0) * 100 / total_enquiries) if total_enquiries else 0,
        }
        for kind, label in Enquiry._meta.get_field("kind").choices
    ]

    schedule = list(
        bookings.filter(date=today)
        .exclude(status__in=["declined", "cancelled"])
        .select_related("location")
        .order_by("time")[:6]
    )
    requests = list(pending.select_related("location").order_by("date", "time")[:5])
    for booking in schedule + requests:
        booking.admin_url = change_url(booking)

    branch_counts = {
        row["location_id"]: row["count"]
        for row in active.filter(date=today).values("location_id").annotate(count=Count("id"))
    }
    branch_unavailable = {
        row["location_id"]: row["count"]
        for row in overrides.filter(is_available=False)
        .values("location_id")
        .annotate(count=Count("id"))
    }
    branches = []
    for location in [selected] if selected else locations:
        branches.append(
            {
                "name": location.name,
                "status": location.status,
                "published": location.is_published,
                "bookings": branch_counts.get(location.pk, 0),
                "unavailable": branch_unavailable.get(location.pk, 0),
                "url": change_url(location),
            }
        )

    # System-wide signals are deliberately labelled and unaffected by location filters.
    failed_emails = EmailMessage.objects.filter(status="failed").count()
    activity = AuditLog.objects.select_related("actor").order_by("-created_at")
    if ids is not None:  # café owners and staff see their own changes
        activity = activity.filter(actor=request.user)
    recent_activity = list(activity[:5])
    for event in recent_activity:
        event.display_action = event.action.replace("admin_", "").replace("_", " ").capitalize()
        event.display_entity = (
            event.entity_type.split(".")[-1]
            .replace("menuitem", "menu item")
            .replace("sitesettings", "site settings")
        )

    return {
        "today": today,
        "period": days,
        "period_options": [7, 14, 30],
        "period_start": start,
        "locations": locations,
        "selected_location": selected,
        "totals": totals,
        "awaiting_count": awaiting_count,
        "new_enquiry_count": enquiry_count,
        "menu_count": published_menu.count(),
        "unavailable_count": unavailable_count,
        "published_location_count": sum(location.is_published for location in locations),
        "trend": trend,
        "trend_peak": peak,
        "trend_delta": trend_delta,
        "chart": column_chart(
            [
                {
                    "label": f"{day['date'].day} {day['date']:%b}",
                    "tip": f"{day['date']:%a} {day['date'].day} {day['date']:%b}",
                    "value": day["count"],
                    "highlight": day["today"],
                }
                for day in trend
            ]
        ),
        "comparison": comparison,
        "enquiry_breakdown": enquiry_breakdown,
        "total_enquiries": total_enquiries,
        "today_schedule": schedule,
        "pending_bookings": requests,
        "branches": branches,
        "failed_emails": failed_emails,
        "recent_activity": recent_activity,
        "booking_list_url": list_url("bookings", "booking", **scope),
        "today_bookings_url": list_url(
            "bookings",
            "booking",
            date__exact=today.isoformat(),
            status__in="requested,confirmed,seated",
            **scope,
        ),
        "pending_bookings_url": list_url("bookings", "booking", status__exact="requested", **scope),
        "enquiry_list_url": list_url("enquiries", "enquiry", **scope),
        "new_enquiries_url": list_url("enquiries", "enquiry", status__exact="new", **scope),
        "unavailable_url": list_url("menu", "locationmenuitem", attention="unavailable", **scope),
    }
