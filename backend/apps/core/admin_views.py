"""Workspace pages that are a piece of work rather than a model table.

Every view is wrapped by BOSAdminSite.admin_view, so only signed-in superusers
reach them, and every write goes through the same audit path as the admin
forms. Figures are computed from real records only: sales come from app and
till orders as recorded, nothing is estimated.
"""

import csv
import platform
from collections import Counter, defaultdict
from datetime import datetime, time, timedelta
from statistics import median
from urllib.parse import urlencode

import django
from django import forms
from django.apps import apps
from django.conf import settings
from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.db import connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.db.models import Avg, Count, F, Max, Min, Q, Sum
from django.db.models import Q as _Q
from django.db.models.functions import Coalesce, TruncDate
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.template.response import TemplateResponse
from django.urls import NoReverseMatch, reverse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_POST

from apps.accounts.models import User
from apps.bookings.models import Booking, BookingRule
from apps.bookings.services import TRANSITIONS
from apps.enquiries.models import Enquiry
from apps.locations.models import Location
from apps.media.models import MediaAsset
from apps.menu.models import Category, LocationMenuItem, MenuItem
from apps.notifications.models import EmailMessage
from apps.notifications.services import email_provider
from apps.orders.models import Order, OrderAdjustment, OrderLine, OrderPayment
from apps.orders.services import CLOSED
from apps.pos.models import CashShift

from .bos_access import (
    CHAIN,
    MANAGER,
    ROLE_NAMES,
    STAFF,
    bos_location_ids,
    bos_locations,
    bos_role,
    in_scope,
)
from .charts import column_chart, delta, pct, share_rows
from .models import AuditLog, SiteSettings
from .services import audit, snapshot

PERIODS = {"7": 7, "30": 30, "90": 90, "365": 365}
ACTIVE = ("requested", "confirmed", "seated")
STATUS_TONES = {
    "requested": "warn",
    "confirmed": "good",
    "seated": "live",
    "declined": "bad",
    "cancelled": "quiet",
    "no_show": "bad",
}
ACTION_LABELS = {
    "confirmed": "Confirm",
    "declined": "Decline",
    "seated": "Seated",
    "no_show": "No-show",
    "cancelled": "Cancel",
}
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def render(request, site, template, title, **context):
    request.current_app = site.name
    return TemplateResponse(
        request, template, {**site.each_context(request), "title": title, **context}
    )


def changelist(model, **filters):
    url = reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_changelist")
    return f"{url}?{urlencode(filters)}" if filters else url


def day_bounds(start, end):
    """Aware datetimes covering whole local days from start to end inclusive."""
    return (
        timezone.make_aware(datetime.combine(start, time.min)),
        timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min)),
    )


def require(site, request, name):
    if not site.view_allowed(request, name):
        raise PermissionDenied


def area(request, location):
    """Filter for the rows a page covers: one chosen café, or every café the user has."""
    if location:
        return {"location": location}
    ids = bos_location_ids(request.user)
    return {} if ids is None else {"location__in": ids}


def selected_location(request):
    locations = list(bos_locations(request.user).order_by("sort_order", "name"))
    slug = request.GET.get("location", "")
    chosen = next((loc for loc in locations if loc.slug == slug), None)
    if slug and chosen is None:
        raise Http404("Unknown location")
    return locations, chosen


def parse_period(request):
    today = timezone.localdate()
    start, end = parse_date(request.GET.get("from") or ""), parse_date(request.GET.get("to") or "")
    if start and end and start <= end and (end - start).days <= 731:
        preset = "custom"
    else:
        preset = request.GET.get("period") if request.GET.get("period") in PERIODS else "30"
        end, start = today, today - timedelta(days=PERIODS[preset] - 1)
    length = (end - start).days + 1
    previous_end = start - timedelta(days=1)
    return {
        "preset": preset,
        "start": start,
        "end": end,
        "length": length,
        "previous_start": previous_end - timedelta(days=length - 1),
        "previous_end": previous_end,
    }


# --------------------------------------------------------------------------
# Reports


def trend_points(rows, period, weight=None):
    """Bookings (or `weight(row)`, e.g. sales) per day, week or month, by the period's length."""
    counts = Counter()
    for row in rows:
        counts[row["date"]] += weight(row) if weight else 1
    start, end, length = period["start"], period["end"], period["length"]
    today = timezone.localdate()
    if length <= 62:
        days = [start + timedelta(days=i) for i in range(length)]
        return "day", [
            {
                "label": f"{d.day} {d:%b}",
                "tip": f"{d:%a} {d.day} {d:%b}",
                "value": counts.get(d, 0),
                "highlight": d == today,
            }
            for d in days
        ]
    if length <= 200:
        first = start - timedelta(days=start.weekday())
        weeks = []
        while first <= end:
            value = sum(counts.get(first + timedelta(days=i), 0) for i in range(7))
            weeks.append(
                {
                    "label": f"{first.day} {first:%b}",
                    "tip": f"Week of {first.day} {first:%b}",
                    "value": value,
                    "highlight": first <= today < first + timedelta(days=7),
                }
            )
            first += timedelta(days=7)
        return "week", weeks
    months = Counter()
    for row in rows:
        months[(row["date"].year, row["date"].month)] += weight(row) if weight else 1
    cursor, points = start.replace(day=1), []
    while cursor <= end:
        key = (cursor.year, cursor.month)
        points.append(
            {
                "label": f"{cursor:%b}",
                "tip": f"{cursor:%B %Y}",
                "value": months.get(key, 0),
                "highlight": key == (today.year, today.month),
            }
        )
        cursor = (cursor + timedelta(days=32)).replace(day=1)
    return "month", points


def bucket(value, edges):
    for limit, label in edges:
        if value <= limit:
            return label
    return edges[-1][1]


PARTY_BUCKETS = ((1, "1"), (2, "2"), (3, "3"), (4, "4"), (6, "5–6"), (10**6, "7+"))
LEAD_BUCKETS = (
    (0, "Same day"),
    (1, "1 day"),
    (3, "2–3 days"),
    (7, "4–7 days"),
    (14, "1–2 weeks"),
    (10**6, "2+ weeks"),
)


# Orders that count as sales: accepted, not declined/cancelled/refunded/failed.
NOT_SOLD = [*CLOSED, "received"]
TENDERS = dict(OrderPayment._meta.get_field("method").choices)


def sold_orders(start, end, scope):
    return (
        Order.objects.filter(**scope)
        .exclude(status__in=NOT_SOLD)
        .annotate(at=Coalesce("placed_at", "created_at"))
        .filter(at__date__range=(start, end))
    )


def sale_cents(row):
    """What the order sold for: app orders count their gift card share, never the card fee."""
    if row["channel"] == "app":
        return row["total"] + row["gift"] - row["surcharge"]
    return row["total"]


def sales_totals(qs, *fields):
    return [
        {**row, "value": sale_cents(row)}
        for row in qs.values(*fields, "channel").annotate(
            n=Count("id"),
            total=Sum("total_cents"),
            gift=Sum("gift_card_cents"),
            surcharge=Sum("surcharge_cents"),
        )
    ]


def money_rows(rows):
    """share_rows() over cents, shown as dollars."""
    rows = [{**row, "display": f"${row['value'] / 100:,.0f}"} for row in rows]
    return share_rows(rows)


def sales_report(period, scope, cafe_ids):
    """Sales from app and till orders, by the day the order was placed (café time)."""
    orders = sold_orders(period["start"], period["end"], scope)
    previous = sold_orders(period["previous_start"], period["previous_end"], scope)
    days = sales_totals(orders.annotate(date=TruncDate("at")), "date")
    total = sum(row["value"] for row in days)
    count = sum(row["n"] for row in days)
    before = sum(row["value"] for row in sales_totals(previous))
    before_count = sum(row["n"] for row in sales_totals(previous))
    order_scope = {f"order__{key}": value for key, value in scope.items()}
    since, until = day_bounds(period["start"], period["end"])
    returned = (
        OrderAdjustment.objects.filter(
            created_at__gte=since, created_at__lt=until, **order_scope
        ).aggregate(total=Sum("amount_cents"))["total"]
        or 0
    )
    unit, points = trend_points(days, period, weight=lambda row: round(row["value"] / 100))

    names = dict(Location.objects.values_list("id", "name"))
    per_location = defaultdict(lambda: {"value": 0, "orders": 0})
    for row in sales_totals(orders, "location_id"):
        per_location[row["location_id"]]["value"] += row["value"]
        per_location[row["location_id"]]["orders"] += row["n"]
    locations = [
        {
            "name": names.get(loc_id, "—"),
            "value": per_location[loc_id]["value"],
            "orders": per_location[loc_id]["orders"],
            "avg": per_location[loc_id]["value"] // per_location[loc_id]["orders"]
            if per_location[loc_id]["orders"]
            else None,
            "url": changelist(Order, location__id__exact=loc_id),
        }
        for loc_id in dict.fromkeys([*cafe_ids, *per_location])
    ]
    locations.sort(key=lambda row: -row["value"])

    items = (
        OrderLine.objects.filter(order__in=orders.values("pk"), qty__gt=0)
        .values("item_slug")
        .annotate(units=Sum("qty"), revenue=Sum(F("qty") * F("unit_price_cents")), name=Max("name"))
        .order_by("-units")[:8]
    )
    menu_names = dict(
        MenuItem.objects.filter(slug__in=[row["item_slug"] for row in items]).values_list(
            "slug", "name"
        )
    )
    tenders = Counter()
    for row in (
        OrderPayment.objects.filter(order__in=orders.values("pk"))
        .values("method")
        .annotate(amount=Sum("amount_cents"))
    ):
        tenders[row["method"]] += row["amount"]
    for row in (
        orders.filter(channel="app")
        .values("payment_choice")
        .annotate(paid=Sum("total_cents"), fee=Sum("surcharge_cents"), gift=Sum("gift_card_cents"))
    ):
        tenders["wallet" if row["payment_choice"] == "apple_pay" else "card"] += (
            row["paid"] - row["fee"]
        )
        tenders["gift"] += row["gift"]
    channels = Counter()
    for row in sales_totals(orders):
        channels[row["channel"]] += row["value"]
    shifts = CashShift.objects.filter(
        status="closed", closed_at__gte=since, closed_at__lt=until, **scope
    )
    variance = shifts.aggregate(total=Sum("variance_cents"), n=Count("id"))
    return {
        "total": total,
        "total_delta": delta(total, before),
        "orders": count,
        "orders_delta": delta(count, before_count),
        "avg": total // count if count else None,
        "returned": returned,
        "shifts": variance["n"],
        "variance": variance["total"] or 0,
        "unit": unit,
        "chart": column_chart(points, money=True),
        "locations": share_rows(locations),
        "items": share_rows(
            [
                {
                    "label": menu_names.get(row["item_slug"], row["name"]),
                    "value": row["units"],
                    "display": f"{row['units']} · ${row['revenue'] / 100:,.0f}",
                }
                for row in items
            ]
        ),
        "tenders": money_rows(
            [
                {"label": TENDERS[key], "value": value}
                for key, value in tenders.most_common()
                if value
            ]
        ),
        "channels": money_rows(
            [
                {"label": "Till" if key == "pos" else "App", "value": value}
                for key, value in channels.most_common()
                if value
            ]
        ),
    }


def export_orders(period, scope):
    rows = (
        sold_orders(period["start"], period["end"], scope).select_related("location").order_by("at")
    )
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = (
        f'attachment; filename="orders-{period["start"]}-to-{period["end"]}.csv"'
    )
    writer = csv.writer(response)
    writer.writerow(
        ["Number", "Placed", "Location", "Channel", "Type", "Status", "Sale (AUD)", "Staff"]
    )
    for order in rows:
        value = sale_cents(
            {
                "channel": order.channel,
                "total": order.total_cents,
                "gift": order.gift_card_cents,
                "surcharge": order.surcharge_cents,
            }
        )
        writer.writerow(
            [
                order.number,
                timezone.localtime(order.at).strftime("%Y-%m-%d %H:%M"),
                order.location.name,
                order.get_channel_display(),
                order.get_method_display(),
                order.status,
                f"{value / 100:.2f}",
                order.staff_name,
            ]
        )
    return response


def booking_report(period, scope, cafe_ids):
    rows = list(
        Booking.objects.filter(date__range=(period["start"], period["end"]), **scope).values(
            "date", "time", "party_size", "status", "source", "location_id", "created_at"
        )
    )
    previous = Booking.objects.filter(
        date__range=(period["previous_start"], period["previous_end"]), **scope
    ).aggregate(
        total=Count("id"),
        guests=Sum("party_size", filter=~Q(status__in=["declined", "cancelled"])),
    )
    statuses = Counter(row["status"] for row in rows)
    kept = [row for row in rows if row["status"] not in ("declined", "cancelled")]
    guests = sum(row["party_size"] for row in kept)
    decided_visits = statuses["seated"] + statuses["no_show"]
    leads = [
        max(0, (row["date"] - timezone.localtime(row["created_at"]).date()).days) for row in rows
    ]
    unit, points = trend_points(rows, period)

    # Always at least a café day (7am–3pm), widened to any booking outside it.
    seen = {row["time"].hour for row in rows} | {7, 15}
    hours = list(range(min(seen), max(seen) + 1))
    grid = Counter((row["date"].weekday(), row["time"].hour) for row in kept)
    peak = max(grid.values(), default=0)
    heatmap = [
        {
            "day": WEEKDAYS[day],
            "cells": [
                {
                    "hour": hour,
                    "count": grid.get((day, hour), 0),
                    "level": 0
                    if not grid.get((day, hour))
                    else min(4, 1 + grid[(day, hour)] * 4 // (peak + 1)),
                }
                for hour in hours
            ],
        }
        for day in range(7)
    ]
    busiest = max(grid.items(), key=lambda kv: kv[1], default=None)

    names = dict(Location.objects.values_list("id", "name"))
    per_location = defaultdict(
        lambda: {"bookings": 0, "guests": 0, "kept": 0, "no_show": 0, "seated": 0}
    )
    for row in rows:
        entry = per_location[row["location_id"]]
        entry["bookings"] += 1
        if row["status"] not in ("declined", "cancelled"):
            entry["guests"] += row["party_size"]
            entry["kept"] += 1
        if row["status"] in ("no_show", "seated"):
            entry[row["status"]] += 1
    location_rows = []
    for loc_id in dict.fromkeys([*cafe_ids, *per_location]):
        entry = per_location[loc_id]
        visits = entry["seated"] + entry["no_show"]
        location_rows.append(
            {
                "name": names.get(loc_id, "—"),
                "value": entry["bookings"],
                "guests": entry["guests"],
                "avg_party": round(entry["guests"] / entry["kept"], 1) if entry["kept"] else None,
                "no_show_rate": round(entry["no_show"] * 100 / visits) if visits else None,
                "url": changelist(
                    Booking,
                    location__id__exact=loc_id,
                    date__gte=period["start"].isoformat(),
                    date__lte=period["end"].isoformat(),
                ),
            }
        )
    location_rows.sort(key=lambda row: -row["value"])

    return {
        "total": len(rows),
        "total_delta": delta(len(rows), previous["total"]),
        "previous_total": previous["total"],
        "guests": guests,
        "guests_delta": delta(guests, previous["guests"] or 0),
        "avg_party": round(guests / len(kept), 1) if kept else None,
        "no_show_rate": round(statuses["no_show"] * 100 / decided_visits)
        if decided_visits
        else None,
        "lost_rate": round((statuses["declined"] + statuses["cancelled"]) * 100 / len(rows))
        if rows
        else None,
        "median_lead": median(leads) if leads else None,
        "unit": unit,
        "chart": column_chart(points),
        "statuses": share_rows(
            [
                {
                    "label": label.replace("_", "-").capitalize(),
                    "value": statuses.get(key, 0),
                    "tone": STATUS_TONES[key],
                }
                for key, label in Booking.Status.choices
            ],
            total=len(rows) or None,
        ),
        "heatmap": heatmap,
        "hours": [f"{h % 12 or 12}{'a' if h < 12 else 'p'}" for h in hours],
        "busiest": f"{WEEKDAYS[busiest[0][0]]} {busiest[0][1] % 12 or 12}{'am' if busiest[0][1] < 12 else 'pm'}"
        if busiest
        else None,
        "party": share_rows(
            [
                {
                    "label": label,
                    "value": Counter(bucket(r["party_size"], PARTY_BUCKETS) for r in kept).get(
                        label, 0
                    ),
                }
                for _, label in PARTY_BUCKETS
            ]
        ),
        "lead": share_rows(
            [
                {
                    "label": label,
                    "value": Counter(bucket(v, LEAD_BUCKETS) for v in leads).get(label, 0),
                }
                for _, label in LEAD_BUCKETS
            ]
        ),
        "sources": share_rows(
            [
                {"label": label, "value": Counter(r["source"] for r in rows).get(key, 0)}
                for key, label in Booking._meta.get_field("source").choices
            ],
            total=len(rows) or None,
        ),
        "locations": share_rows(location_rows),
    }


def enquiry_report(period, scope):
    since, until = day_bounds(period["start"], period["end"])
    before, _ = day_bounds(period["previous_start"], period["previous_end"])
    current = Enquiry.objects.filter(created_at__gte=since, created_at__lt=until, **scope)
    statuses = Counter(current.values_list("status", flat=True))
    kinds = Counter(current.values_list("kind", flat=True))
    total = sum(statuses.values())
    closed_deals = statuses["won"] + statuses["lost"]
    previous = Enquiry.objects.filter(created_at__gte=before, created_at__lt=since, **scope).count()
    labels = {
        "new": "New",
        "in_progress": "In progress",
        "quoted": "Quoted",
        "won": "Won",
        "lost": "Lost",
        "closed": "Closed",
    }
    tones = {
        "new": "warn",
        "in_progress": "info",
        "quoted": "live",
        "won": "good",
        "lost": "bad",
        "closed": "quiet",
    }
    return {
        "total": total,
        "total_delta": delta(total, previous),
        "win_rate": round(statuses["won"] * 100 / closed_deals) if closed_deals else None,
        "open": statuses["new"] + statuses["in_progress"] + statuses["quoted"],
        "pipeline": share_rows(
            [{"label": labels[k], "value": statuses.get(k, 0), "tone": tones[k]} for k in labels],
            total=total or None,
        ),
        "kinds": share_rows(
            [
                {"label": label, "value": kinds.get(key, 0), "kind": key}
                for key, label in Enquiry._meta.get_field("kind").choices
            ],
            total=total or None,
        ),
    }


def menu_report(scope):
    categories = []
    for category in Category.objects.order_by("sort_order", "name"):
        items = MenuItem.objects.filter(category=category)
        stats = items.filter(is_published=True).aggregate(
            low=Min("base_price_cents"), avg=Avg("base_price_cents"), high=Max("base_price_cents")
        )
        categories.append(
            {
                "name": category.name,
                "active": category.is_active,
                "published": items.filter(is_published=True).count(),
                "total": items.count(),
                "low": stats["low"],
                "avg": round(stats["avg"]) if stats["avg"] is not None else None,
                "high": stats["high"],
                "url": changelist(MenuItem, category__id__exact=category.pk),
            }
        )
    overrides = LocationMenuItem.objects.filter(menu_item__is_published=True)
    overrides = overrides.filter(**scope)
    by_location = (
        overrides.values("location__name", "location_id")
        .annotate(
            unavailable=Count("id", filter=Q(is_available=False, is_hidden=False)),
            hidden=Count("id", filter=Q(is_hidden=True)),
            priced=Count("id", filter=Q(price_override_cents__isnull=False)),
        )
        .order_by("location__name")
    )
    return {"categories": categories, "locations": list(by_location)}


def reports_view(site):
    def view(request):
        require(site, request, "bos_reports")
        period = parse_period(request)
        locations, location = selected_location(request)
        scope = area(request, location)
        cafe_ids = [location.pk] if location else [c.pk for c in locations if c.is_published]
        if request.GET.get("export") == "bookings":
            return export_bookings(period, scope)
        if request.GET.get("export") == "orders":
            return export_orders(period, scope)
        query = request.GET.copy()
        query.pop("export", None)
        return render(
            request,
            site,
            "admin/bos/reports.html",
            "Reports",
            period=period,
            period_options=PERIODS,
            locations=locations,
            selected_location=location,
            sales=sales_report(period, scope, cafe_ids),
            bookings=booking_report(period, scope, cafe_ids),
            enquiries=enquiry_report(period, scope),
            menu=menu_report(scope),
            export_query=urlencode({**query.dict(), "export": "bookings"}),
            export_orders_query=urlencode({**query.dict(), "export": "orders"}),
        )

    return view


def export_bookings(period, scope):
    rows = Booking.objects.filter(date__range=(period["start"], period["end"])).select_related(
        "location"
    )
    rows = rows.filter(**scope)
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = (
        f'attachment; filename="bookings-{period["start"]}-to-{period["end"]}.csv"'
    )
    writer = csv.writer(response)
    writer.writerow(
        [
            "Reference",
            "Date",
            "Time",
            "Location",
            "Party size",
            "Status",
            "Source",
            "Guest",
            "Requested at",
        ]
    )
    for booking in rows.order_by("date", "time"):
        writer.writerow(
            [
                booking.reference,
                booking.date.isoformat(),
                booking.time.strftime("%H:%M"),
                booking.location.name,
                booking.party_size,
                booking.get_status_display(),
                booking.get_source_display(),
                booking.name,
                timezone.localtime(booking.created_at).strftime("%Y-%m-%d %H:%M"),
            ]
        )
    return response


# --------------------------------------------------------------------------
# Schedule


def schedule_view(site):
    def view(request):
        require(site, request, "bos_schedule")
        today = timezone.localdate()
        day = parse_date(request.GET.get("date") or "") or today
        locations, location = selected_location(request)
        bookings = (
            Booking.objects.filter(date=day)
            .select_related("location")
            .order_by("time", "created_at")
        )
        bookings = bookings.filter(**area(request, location))
        rules = {rule.location_id: rule for rule in BookingRule.objects.all()}
        here = reverse("admin:bos_schedule") + "?" + request.GET.urlencode()
        groups = defaultdict(list)
        for booking in bookings:
            booking.tone = STATUS_TONES[booking.status]
            booking.actions = [
                {
                    "label": ACTION_LABELS[status],
                    "url": reverse("admin:bookings_booking_transition", args=[booking.pk, status]),
                    "style": "primary"
                    if status in ("confirmed", "seated")
                    else "danger"
                    if status in ("declined", "no_show")
                    else "ghost",
                }
                for status in ("confirmed", "seated", "declined", "no_show", "cancelled")
                if status in TRANSITIONS[booking.status]
            ]
            groups[booking.location].append(booking)

        cards = []
        shown = (
            [location]
            if location
            else [loc for loc in locations if loc.is_published or loc in groups]
        )
        for loc in shown:
            items = groups.get(loc, [])
            rule = rules.get(loc.pk)
            slot = rule.slot_minutes if rule else 30
            slots = defaultdict(list)
            for booking in items:
                minutes = booking.time.hour * 60 + booking.time.minute
                start = minutes - minutes % slot
                slots[start].append(booking)
            slot_rows = []
            for start, members in sorted(slots.items()):
                covers = sum(b.party_size for b in members if b.status in ACTIVE)
                capacity = rule.max_covers_per_slot if rule else None
                slot_rows.append(
                    {
                        "label": time(start // 60, start % 60).strftime("%I:%M %p").lstrip("0"),
                        "covers": covers,
                        "capacity": capacity,
                        "fill": pct(covers, capacity) if capacity else None,
                        "full": bool(capacity and covers >= capacity),
                        "bookings": members,
                    }
                )
            cards.append(
                {
                    "location": loc,
                    "rule": rule,
                    "slots": slot_rows,
                    "count": len(items),
                    "guests": sum(b.party_size for b in items if b.status in ACTIVE),
                    "waiting": sum(b.status == "requested" for b in items),
                }
            )
        if not location:
            cards.sort(key=lambda card: (not card["count"], card["location"].sort_order))
        all_items = [b for items in groups.values() for b in items]
        return render(
            request,
            site,
            "admin/bos/schedule.html",
            "Schedule",
            day=day,
            today=today,
            previous_day=day - timedelta(days=1),
            next_day=day + timedelta(days=1),
            locations=locations,
            selected_location=location,
            cards=cards,
            here=here,
            summary={
                "bookings": len(all_items),
                "guests": sum(b.party_size for b in all_items if b.status in ACTIVE),
                "waiting": sum(b.status == "requested" for b in all_items),
                "seated": sum(b.status == "seated" for b in all_items),
                "no_show": sum(b.status == "no_show" for b in all_items),
            },
        )

    return view


# --------------------------------------------------------------------------
# Availability board


def availability_state(override):
    if override and override.is_hidden:
        return "hidden", "Hidden"
    if override and not override.is_available:
        return "off", "Sold out"
    return "on", "Available"


def set_availability(request, item, location, available):
    with transaction.atomic():
        obj = (
            LocationMenuItem.objects.select_for_update()
            .filter(location=location, menu_item=item)
            .first()
        )
        if obj is None and available:
            return None
        before = snapshot(obj) if obj else None
        if obj is None:
            obj = LocationMenuItem(location=location, menu_item=item, created_by=request.user)
        if obj.is_available == available and before is not None:
            return obj
        obj.is_available = available
        obj.updated_by = request.user
        obj.save()
        audit(request, obj, before, "admin_create" if before is None else "admin_update")
        return obj


def availability_view(site):
    def view(request):
        require(site, request, "bos_availability")
        if request.method == "POST":
            return availability_update(request)
        locations = list(
            bos_locations(request.user).filter(is_published=True).order_by("sort_order", "name")
        )
        categories = list(Category.objects.filter(is_active=True).order_by("sort_order", "name"))
        category = next((c for c in categories if c.slug == request.GET.get("category")), None)
        query = (request.GET.get("q") or "").strip()
        # Chain items, plus café-only items of the cafés shown here.
        items = MenuItem.objects.filter(
            _Q(location__isnull=True) | _Q(location__in=[c.pk for c in locations]),
            is_published=True,
            category__is_active=True,
        ).select_related("category")
        if category:
            items = items.filter(category=category)
        if query:
            items = items.filter(name__icontains=query)
        items = list(items.order_by("category__sort_order", "category__name", "sort_order", "name"))
        overrides = {
            (row.menu_item_id, row.location_id): row
            for row in LocationMenuItem.objects.filter(menu_item__in=items)
        }
        rows, sold_out = [], Counter()
        for item in items:
            cells = []
            for loc in locations:
                if item.location_id and item.location_id != loc.pk:
                    cells.append({"location": loc, "state": "na", "label": "Not sold here"})
                    continue
                state, label = availability_state(overrides.get((item.pk, loc.pk)))
                if state == "off":
                    sold_out[loc.pk] += 1
                cells.append({"location": loc, "state": state, "label": label})
            rows.append(
                {"item": item, "cells": cells, "off": sum(c["state"] == "off" for c in cells)}
            )
        return render(
            request,
            site,
            "admin/bos/availability.html",
            "Availability board",
            locations=[{"location": loc, "sold_out": sold_out[loc.pk]} for loc in locations],
            categories=categories,
            selected_category=category,
            query=query,
            rows=rows,
            total_off=sum(sold_out.values()),
        )

    return view


@require_POST
def availability_update(request):
    item = get_object_or_404(MenuItem, pk=request.POST.get("item"))
    if item.location_id and not in_scope(request.user, item.location_id):
        raise Http404
    available = request.POST.get("available") == "1"
    target = request.POST.get("location")
    cafes = bos_locations(request.user)
    if item.location_id:  # a café-only item can only change at its own café
        cafes = cafes.filter(pk=item.location_id)
    if target == "all":
        targets = list(cafes.filter(is_published=True))
    else:
        targets = [get_object_or_404(cafes, pk=target)]
    for location in targets:
        set_availability(request, item, location, available)
    if request.headers.get("x-requested-with") == "fetch":
        overrides = {
            row.location_id: row
            for row in LocationMenuItem.objects.filter(menu_item=item, location__in=targets)
        }
        return JsonResponse(
            {
                "cells": [
                    dict(
                        zip(
                            ("state", "label"),
                            availability_state(overrides.get(loc.pk)),
                            strict=True,
                        )
                    )
                    | {"location": str(loc.pk)}
                    for loc in targets
                ]
            }
        )
    word = "available" if available else "sold out"
    where = "all locations" if target == "all" else targets[0].name
    messages.success(request, f"{item.name} is now {word} at {where}.")
    return redirect(request.POST.get("next") or reverse("admin:bos_availability"))


# --------------------------------------------------------------------------
# System status


def media_picker_view(site):
    """Thumbnails for the photo picker on menu, catering and location forms."""

    def view(request):
        from apps.media.admin import preview_url
        from apps.media.services import BRAND

        require(site, request, "bos_media_picker")
        query = request.GET.get("q", "").strip()
        assets = MediaAsset.objects.filter(is_active=True)
        if query:
            assets = assets.filter(alt_text__icontains=query)
        results = [
            {
                "id": str(asset.pk),
                "name": str(asset),
                "label": str(asset).removesuffix(f" – {BRAND}"),
                "thumb": preview_url(asset, "thumb"),
                "full": preview_url(asset, "lg"),
                "size": f"{asset.width} × {asset.height}" if asset.width else "",
            }
            for asset in assets.order_by("alt_text", "legacy_path")[:500]
        ]
        return JsonResponse({"results": results})

    return view


def system_view(site):
    def view(request):
        require(site, request, "bos_system")
        today = timezone.localdate()
        now = timezone.now()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            executor = MigrationExecutor(connection)
            pending = len(executor.migration_plan(executor.loader.graph.leaf_nodes()))
            db_ok = True
        except Exception:  # noqa: BLE001 - the page reports the failure instead of raising
            db_ok, pending = False, None

        emails = Counter(EmailMessage.objects.values_list("status", flat=True))
        oldest = (
            EmailMessage.objects.filter(status__in=["pending", "sending"])
            .order_by("created_at")
            .first()
        )
        last_sent = EmailMessage.objects.filter(status="sent").order_by("-sent_at").first()
        settings_row = SiteSettings.objects.first()

        def check(label, ok, value, detail="", url=None, level=None):
            return {
                "label": label,
                "state": level or ("ok" if ok else "warn"),
                "value": value,
                "detail": detail,
                "url": url,
            }

        platform_checks = [
            check(
                "Database",
                db_ok,
                f"{connection.vendor.capitalize()} · reachable" if db_ok else "Unreachable",
                "All migrations applied."
                if pending == 0
                else f"{pending} migration(s) not applied yet."
                if pending
                else "",
                level=None if db_ok and pending == 0 else "bad" if not db_ok else "warn",
            ),
            check(
                "Email delivery",
                bool(settings.EMAIL_PROVIDER_API_KEY),
                f"{email_provider().title()} configured"
                if settings.EMAIL_PROVIDER_API_KEY
                else "Not configured",
                "Customer emails are queued but cannot be delivered until EMAIL_PROVIDER_API_KEY is set."
                if not settings.EMAIL_PROVIDER_API_KEY
                else f"Sending as {settings.EMAIL_FROM}",
                changelist(EmailMessage),
            ),
            check(
                "Image storage",
                bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY),
                "Supabase Storage" if settings.SUPABASE_URL else "Not configured",
                "Uploads from BOS need SUPABASE_URL and the service role key."
                if not settings.SUPABASE_URL
                else f"Bucket: {settings.SUPABASE_STORAGE_BUCKET}",
            ),
            check(
                "Scheduled jobs",
                bool(settings.JOB_TOKEN),
                "Token set" if settings.JOB_TOKEN else "No JOB_TOKEN",
                "Email retries and clean-up run from GitHub Actions with X-Job-Token.",
            ),
            check(
                "Spam protection",
                True,
                "Turnstile on" if settings.TURNSTILE_SECRET_KEY else "Honeypot + rate limit",
                "Turnstile is optional; forms always use a honeypot and database rate limits.",
                level="info",
            ),
            check(
                "Debug mode",
                not settings.DEBUG,
                "Off" if not settings.DEBUG else "On (development)",
                "Must be off in production.",
                level=None if not settings.DEBUG else "info",
            ),
        ]

        stale_requests = Booking.objects.filter(status="requested", date__lt=today).count()
        old_enquiries = Enquiry.objects.filter(
            status="new", created_at__lt=now - timedelta(days=2)
        ).count()
        published = Location.objects.filter(is_published=True)
        # A café still marked TBC has no hours to enter yet; it is not a gap.
        no_hours = published.filter(status="open", opening_hours__isnull=True).count()
        enabled_no_hours = BookingRule.objects.filter(
            is_enabled=True, location__opening_hours__isnull=True
        ).count()
        live_items = MenuItem.objects.filter(is_published=True)
        data_checks = [
            check(
                "Past booking requests never answered",
                not stale_requests,
                stale_requests,
                "Requests for a date that has passed — decline or cancel them so guests get an answer.",
                changelist(Booking, status__exact="requested", date__lt=today.isoformat()),
            ),
            check(
                "New enquiries older than 2 days",
                not old_enquiries,
                old_enquiries,
                "Catering and wholesale leads go cold quickly.",
                changelist(Enquiry, status__exact="new"),
            ),
            check(
                "Failed emails",
                not emails["failed"],
                emails["failed"],
                "Guests may not have received a confirmation.",
                changelist(EmailMessage, status__exact="failed"),
            ),
            check(
                "Published locations without opening hours",
                not no_hours,
                no_hours,
                "Open cafés the booking form cannot offer slots for. Cafés marked TBC are skipped.",
                changelist(
                    Location,
                    is_published__exact=1,
                    status__exact="open",
                    opening_hours__isnull="True",
                ),
            ),
            check(
                "Booking switched on but no opening hours",
                not enabled_no_hours,
                enabled_no_hours,
                "Guests will see no slots until weekly hours are added.",
                changelist(BookingRule, is_enabled__exact=1),
            ),
            check(
                "Published menu items without a photo",
                not live_items.filter(image__isnull=True).exists(),
                live_items.filter(image__isnull=True).count(),
                "Items show a placeholder on the website.",
                changelist(MenuItem, is_published__exact=1, image__isnull="True"),
            ),
            check(
                "Published menu items priced at $0",
                not live_items.filter(base_price_cents=0).exists(),
                live_items.filter(base_price_cents=0).count(),
                "Usually a price that was never entered.",
                changelist(MenuItem, is_published__exact=1, base_price_cents=0),
            ),
            check(
                "Active categories with nothing published",
                not Category.objects.filter(is_active=True)
                .exclude(items__is_published=True)
                .exists(),
                Category.objects.filter(is_active=True).exclude(items__is_published=True).count(),
                "Empty sections appear on the menu.",
                changelist(Category, is_active__exact=1),
            ),
        ]
        activity = AuditLog.objects.aggregate(
            day=Count("id", filter=Q(created_at__gte=now - timedelta(days=1))),
            week=Count("id", filter=Q(created_at__gte=now - timedelta(days=7))),
        )
        return render(
            request,
            site,
            "admin/bos/system.html",
            "System status",
            platform_checks=platform_checks,
            data_checks=data_checks,
            issues=sum(c["state"] in ("warn", "bad") for c in data_checks),
            emails={
                "pending": emails["pending"] + emails["sending"],
                "sent": emails["sent"],
                "failed": emails["failed"],
                "oldest": oldest,
                "last_sent": last_sent,
            },
            activity=activity,
            facts=[
                ("Menu version", settings_row.menu_version if settings_row else "—"),
                ("Website", settings.CLIENT_BASE_URL),
                ("Allowed origins", "Any (all browser origins may call the API)"),
                ("Time zone", settings.TIME_ZONE),
                ("Django", django.get_version()),
                ("Python", platform.python_version()),
            ],
        )

    return view


ROLE_ACCESS = {
    CHAIN: (
        ("store", "Every café, order, booking and enquiry"),
        ("utensils", "Menu, prices, photos and catering"),
        ("users", "Café owners, staff and customer accounts"),
        ("chart", "Reports, sales and system status"),
    ),
    MANAGER: (
        ("calendar", "Bookings, orders and enquiries at your cafés"),
        ("clock", "Opening hours, booking rules and café details"),
        ("users", "Your team's accounts and till PINs"),
        ("chart", "Reports and sales for your cafés"),
    ),
    STAFF: (
        ("clipboard", "Today's schedule and bookings"),
        ("toggle", "Sold-out switches on the availability board"),
        ("utensils", "Menu, prices and photos (view only)"),
        ("inbox", "Enquiries for your cafés (view only)"),
    ),
}


class ProfileForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ["first_name", "last_name", "phone"]
        widgets = {
            "first_name": forms.TextInput(
                attrs={"class": "bos-field", "autocomplete": "given-name"}
            ),
            "last_name": forms.TextInput(
                attrs={"class": "bos-field", "autocomplete": "family-name"}
            ),
            "phone": forms.TextInput(
                attrs={"class": "bos-field", "autocomplete": "tel", "inputmode": "tel"}
            ),
        }


def activity_links(site, request, events):
    """Point each feed row at its record when the user may open that table."""
    allowed = {}
    for event in events:
        event.url = None
        if event.entity_type not in allowed:
            try:
                model = apps.get_model(event.entity_type)
            except (LookupError, ValueError):
                model = None
            model_admin = site._registry.get(model)
            allowed[event.entity_type] = bool(
                model_admin and model_admin.has_view_permission(request)
            )
        if allowed[event.entity_type]:
            app_label, model_name = event.entity_type.split(".")
            try:
                event.url = reverse(
                    f"admin:{app_label}_{model_name}_change", args=[event.entity_id]
                )
            except NoReverseMatch:
                pass
    return events


def profile_view(site):
    """The signed-in person's own account: details, cafés, access and recent changes."""

    def view(request):
        from .dashboard import label_activity

        user = request.user
        form = ProfileForm(request.POST or None, instance=user)
        if request.method == "POST" and form.is_valid():
            if form.has_changed():
                with transaction.atomic():
                    before = snapshot(User.objects.get(pk=user.pk))
                    form.save()
                    audit(request, user, before, "update")
                messages.success(request, "Your details were saved.")
            return redirect("admin:bos_profile")

        role = bos_role(user)
        now = timezone.now()
        cafes = list(bos_locations(user).order_by("sort_order", "name"))
        mine = AuditLog.objects.filter(actor=user)
        counts = mine.aggregate(
            week=Count("id", filter=Q(created_at__gte=now - timedelta(days=7))),
            month=Count("id", filter=Q(created_at__gte=now - timedelta(days=30))),
        )
        user_admin = site._registry.get(User)
        return render(
            request,
            site,
            "admin/bos/profile.html",
            "Your profile",
            form=form,
            profile_user=user,
            role_name=ROLE_NAMES.get(role, user.get_role_display()),
            all_cafes=role == CHAIN,
            cafes=cafes,
            access=ROLE_ACCESS.get(role, ()),
            counts=counts,
            has_pin=bool(user.pos_pin),
            recent=activity_links(
                site,
                request,
                label_activity(mine.select_related("actor").order_by("-created_at")[:8]),
            ),
            can_open_account=bool(user_admin and user_admin.has_change_permission(request, user)),
        )

    return view


def team_view(site):
    """Who works where: every café the viewer runs, with its owners and staff."""

    def view(request):
        require(site, request, "bos_team")
        from apps.accounts.models import StaffAssignment, User

        user_admin = site._registry[User]
        location_admin = site._registry[Location]
        chain = bos_role(request.user) == CHAIN
        can_add = user_admin.has_add_permission(request)
        cafes = list(bos_locations(request.user).order_by("sort_order", "name"))
        rows = (
            StaffAssignment.objects.filter(location__in=cafes)
            .exclude(user__role="customer", user__is_superuser=False)
            .select_related("user", "location")
            .order_by("user__first_name", "user__last_name", "user__email")
        )
        by_cafe = {cafe.pk: [] for cafe in cafes}
        for row in rows:
            by_cafe[row.location_id].append(row)

        def person(row):
            member = row.user
            owner = member.is_superuser or member.role == "manager"
            return {
                "user": member,
                "name": member.get_full_name() or member.email,
                "role": "Chain owner"
                if member.is_superuser
                else ("Café owner" if owner else "Staff"),
                "is_owner": owner,
                "active": member.is_active and row.is_active,
                "assignment_active": row.is_active,
                "has_pin": bool(member.pos_pin),
                "url": (
                    reverse("admin:accounts_user_change", args=[member.pk])
                    if user_admin.has_change_permission(request, member)
                    else ""
                ),
            }

        cards = []
        totals = {"people": set(), "owners": set(), "locked": set()}
        for cafe in cafes:
            people = [person(row) for row in by_cafe[cafe.pk]]
            for item in people:
                totals["people"].add(item["user"].pk)
                if item["is_owner"]:
                    totals["owners"].add(item["user"].pk)
                if not item["active"]:
                    totals["locked"].add(item["user"].pk)
            cards.append(
                {
                    "cafe": cafe,
                    "url": (
                        reverse("admin:locations_location_change", args=[cafe.pk])
                        if location_admin.has_view_permission(request, cafe)
                        else ""
                    ),
                    "owners": [p for p in people if p["is_owner"]],
                    "staff": [p for p in people if not p["is_owner"]],
                    "active_count": sum(1 for p in people if p["active"]),
                    "locked_count": sum(1 for p in people if not p["active"]),
                    "add_url": (
                        f"{reverse('admin:accounts_user_add')}?locations={cafe.pk}"
                        if can_add
                        else ""
                    ),
                    "assignments_url": changelist(StaffAssignment, location__id__exact=cafe.pk),
                }
            )
        unassigned = []
        if chain:
            assigned = StaffAssignment.objects.filter(is_active=True).values("user_id")
            unassigned = list(
                User.objects.filter(role__in=("manager", "staff"), is_superuser=False)
                .exclude(pk__in=assigned)
                .order_by("first_name", "last_name", "email")
            )
        return render(
            request,
            site,
            "admin/bos/team.html",
            "Team by café",
            cards=cards,
            totals={key: len(value) for key, value in totals.items()},
            unassigned=unassigned,
            chain=chain,
            add_url=reverse("admin:accounts_user_add") if can_add else "",
            team_url=changelist(User),
        )

    return view
