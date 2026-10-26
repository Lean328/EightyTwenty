"""
App orders: server-side pricing (port of the app's src/domain/pricing.ts), validation in the
order the app documents (docs/API_CONTRACTS.md §9.1), side effects and the status lifecycle.
"""

from django.db import transaction
from django.utils import timezone

from apps.core.exceptions import DomainError
from apps.core.models import SiteSettings
from apps.core.services import audit, snapshot
from apps.locations.models import Location
from apps.locations.services import takes_customers
from apps.loyalty import services as loyalty
from apps.loyalty.models import STAMPS_PER_REWARD
from apps.menu.catalog import menu_items
from apps.mobile.errors import AppError, invalid
from apps.notifications.services import enqueue_email, notify

from . import payments
from .models import Order, OrderLine, order_number

METHOD_LABELS = {"pickup": "Pickup", "delivery": "Delivery", "dine_in": "Dine In"}
DEFAULT_WAIT = "15–20 min"
UNAVAILABLE = "An item in your order is no longer available."
LIVE = ["received", "confirmed", "preparing", "ready"]
# Staff may skip ahead (a quiet morning goes straight to "ready"); declining stops at "ready".
TRANSITIONS = {
    "received": ["confirmed", "preparing", "ready", "completed", "declined"],
    "confirmed": ["preparing", "ready", "completed", "declined"],
    "preparing": ["ready", "completed", "declined"],
    "ready": ["completed"],
    "completed": [],
    "declined": [],
    "cancelled": [],
    "refunded": [],
    "failed": [],
}
# Statuses that end an order without the sale standing (refunds money, stamps and gift card).
CLOSED = {"declined", "cancelled", "refunded", "failed"}


def basis_points(rate):
    return int(round(float(rate) * 10_000))


def apply_rate(cents, points):
    """cents × rate, rounded half-up to a whole cent, in integers (10% of 2365 → 237)."""
    return (cents * points + 5_000) // 10_000


def order_rules():
    rules = SiteSettings.load().order_rules or {}
    return (
        basis_points(rules.get("deliveryRate", 0.1)),
        basis_points(rules.get("cardSurcharge", 0.0295)),
    )


def compute_totals(lines, method, choice, stamps, use_reward, use_gift_card, balance_cents):
    """
    lines: [(unit_price_cents, qty, is_coffee)]. Fixed order: subtotal → +delivery → −free
    coffee (one unit of the cheapest coffee line) → +card surcharge → −gift card → total.
    """
    delivery_rate, surcharge_rate = order_rules()
    subtotal = sum(unit * qty for unit, qty, _ in lines)
    delivery = apply_rate(subtotal, delivery_rate) if method == "delivery" else 0
    coffees = [unit for unit, _, coffee in lines if coffee]
    reward_available = stamps >= STAMPS_PER_REWARD and bool(coffees)
    reward = min(coffees) if reward_available and use_reward else 0
    card = choice in ("saved_card", "new_card")
    surcharge = apply_rate(max(0, subtotal + delivery - reward), surcharge_rate) if card else 0
    pre_gift = subtotal + delivery - reward + surcharge
    gift_card = max(0, min(balance_cents, pre_gift)) if use_gift_card else 0
    return {
        "subtotal": subtotal,
        "delivery": delivery,
        "reward": reward,
        "surcharge": surcharge,
        "gift_card": gift_card,
        "total": max(0, pre_gift - gift_card),
        "reward_available": reward_available,
        "coffee_count": sum(qty for _, qty, coffee in lines if coffee),
        "item_count": sum(qty for _, qty, _ in lines),
    }


def order_location(data):
    location = (
        Location.objects.filter(slug=data["locationId"], is_published=True)
        .prefetch_related("opening_hours")
        .first()
    )
    if location is None or not takes_customers(location):
        raise AppError("LOCATION_UNAVAILABLE", "This café isn’t taking orders yet.", 422)
    method = data["method"]
    if method not in location.fulfilment_methods:
        raise invalid(
            f"{METHOD_LABELS[method]} isn’t offered at {location.name}.", method="invalid"
        )
    if method == "delivery" and not (data.get("deliveryAddress") or "").strip():
        raise invalid("Add a delivery address first.", deliveryAddress="required")
    if method == "dine_in" and not (data.get("tableNumber") or "").strip():
        raise invalid("Add your table number first.", tableNumber="required")
    return location


def price_lines(location, lines):
    """Re-price every line from the catalogue; never trust prices from the device."""
    if not lines:
        raise invalid("Your order is empty.")
    entries = {
        entry.item.slug: entry
        for entry in menu_items(location, slugs={line["itemId"] for line in lines})
    }
    priced = []
    for line in lines:
        entry = entries.get(line["itemId"])
        if entry is None or not entry.available:
            raise invalid(UNAVAILABLE)
        selections = line.get("selections") or {}
        if any(code not in {g.code for g in entry.groups} for code in selections):
            raise invalid(UNAVAILABLE)
        unit, names, chosen_by_group = entry.price_cents, [], {}
        for group in entry.groups:  # menu order, as the app builds modifiersLabel
            chosen = list(selections.get(group.code) or [])
            prices = dict(group.options)
            if (
                len(set(chosen)) != len(chosen)
                or any(name not in prices for name in chosen)
                or (group.max_select and len(chosen) > group.max_select)
            ):
                raise invalid(
                    f"Some options for {entry.item.name} have changed. Please choose them again."
                )
            if group.required and not chosen:
                raise invalid(f"Choose options for {entry.item.name}.")
            unit += sum(prices[name] for name in chosen)
            names += chosen
            if chosen:
                chosen_by_group[group.code] = chosen
        priced.append(
            {
                "entry": entry,
                "qty": line["qty"],
                "unit": unit,
                "selections": chosen_by_group,
                "label": ", ".join(names),
                "note": (line.get("note") or "").strip(),
                "coffee": loyalty.is_coffee(entry.category_slug, entry.item.name),
            }
        )
    return priced


def totals_for(user, data, priced, lock=False):
    card = loyalty.card_for(user, lock=lock)
    gift = loyalty.gift_card_for(user, lock=lock)
    totals = compute_totals(
        [(row["unit"], row["qty"], row["coffee"]) for row in priced],
        data["method"],
        data["payment"]["choice"],
        card.stamps,
        data["useReward"],
        data["useGiftCard"],
        gift.balance_cents,
    )
    return card, gift, totals


def quote(user, data):
    """Server-priced totals before payment (optional for the app; removes PRICE_CHANGED trips)."""
    location = order_location(data)
    priced = price_lines(location, data["lines"])
    _, _, totals = totals_for(user, data, priced)
    return priced, totals


def unique_number():
    for _ in range(20):
        number = order_number()
        if not Order.objects.filter(number=number).exists():
            return number
    return f"#8020-{timezone.now():%H%M%S%f}"[:20]


def payment_label(choice, totals):
    if totals["gift_card"] and not totals["total"]:
        return "Gift card"
    base = "Apple Pay" if choice == "apple_pay" else "Card"
    return base + (" + gift card" if totals["gift_card"] else "")


@transaction.atomic
def create_order(user, data, idempotency_key="", request_hash=""):
    """Returns (order, created). A repeated Idempotency-Key replays the original order."""
    if idempotency_key:
        existing = Order.objects.filter(customer=user, idempotency_key=idempotency_key).first()
        if existing:
            if existing.request_hash != request_hash:
                raise AppError(
                    "CONFLICT",
                    "This order was already sent with different details. "
                    "Please check your order and try again.",
                    409,
                )
            return existing, False
    location = order_location(data)
    priced = price_lines(location, data["lines"])
    card, gift, totals = totals_for(user, data, priced, lock=True)
    if totals["total"] != data["expectedTotalCents"]:
        raise AppError(
            "PRICE_CHANGED",
            f"Your total changed to ${totals['total'] / 100:.2f}. Please review your order.",
            409,
        )
    payment = data["payment"]
    if payment["choice"] == "saved_card":
        # Cards on file need a payment provider; none exists yet, so no saved card can match.
        raise invalid("Choose a saved card.", paymentMethodId="invalid")
    reference = ""
    if totals["total"] > 0:
        reference = payments.charge(
            totals["total"], payment.get("token"), f"EightyTwenty order at {location.name}"
        )
    redeemed = totals["reward"] > 0
    _, earned = loyalty.stamps_after_order(card.stamps, totals["coffee_count"], redeemed)
    timing = data["timing"]
    order = Order.objects.create(
        number=unique_number(),
        customer=user,
        location=location,
        method=data["method"],
        scheduled_time=timing.get("time") if timing["type"] == "scheduled" else None,
        delivery_address=(data.get("deliveryAddress") or "").strip()
        if data["method"] == "delivery"
        else "",
        table_number=(data.get("tableNumber") or "").strip() if data["method"] == "dine_in" else "",
        contact_name=data["contact"]["name"].strip(),
        contact_phone=data["contact"]["phone"].strip(),
        payment_choice=payment["choice"],
        payment_label=payment_label(payment["choice"], totals),
        payment_reference=reference,
        subtotal_cents=totals["subtotal"],
        delivery_cents=totals["delivery"],
        reward_cents=totals["reward"],
        surcharge_cents=totals["surcharge"],
        gift_card_cents=totals["gift_card"],
        total_cents=totals["total"],
        stamps_earned=earned,
        reward_redeemed=redeemed,
        estimated_wait=location.wait_text or DEFAULT_WAIT,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        created_by=user,
        updated_by=user,
    )
    for position, row in enumerate(priced):
        OrderLine.objects.create(
            order=order,
            menu_item=row["entry"].item,
            item_slug=row["entry"].item.slug,
            name=row["entry"].item.name,
            qty=row["qty"],
            unit_price_cents=row["unit"],
            selections=row["selections"],
            modifiers_label=row["label"],
            note=row["note"],
            position=position,
        )
    loyalty.apply_order(card, gift, order)
    email_cafe(order)
    return order, True


def email_cafe(order):
    location = order.location
    when = order.scheduled_time.strftime("%H:%M") if order.scheduled_time else "As soon as possible"
    lines = "\n".join(
        f"- {line.qty} × {line.name}"
        + (f" ({line.modifiers_label})" if line.modifiers_label else "")
        + (f" — note: {line.note}" if line.note else "")
        for line in order.lines.all()
    )
    extra = (
        f"Deliver to: {order.delivery_address}\n"
        if order.delivery_address
        else (f"Table: {order.table_number}\n" if order.table_number else "")
    )
    enqueue_email(
        location.email or SiteSettings.load().contact_email,
        f"New app order {order.number} — {location.name}",
        f"{METHOD_LABELS[order.method]} · {when}\n{extra}"
        f"Customer: {order.contact_name}, {order.contact_phone}\n\n{lines}\n\n"
        f"Total ${order.total_cents / 100:.2f} ({order.payment_label}).\n"
        "Accept and update it in the BOS workspace → Orders.",
        f"order-{order.pk}-new",
    )


def status_message(order):
    where = order.location.name
    if order.status == "confirmed":
        return f"Order {order.number} is confirmed at {where}."
    if order.status == "preparing":
        return f"We’re preparing order {order.number}."
    if order.status == "ready":
        if order.method == "delivery":
            return f"Order {order.number} is on its way."
        if order.method == "dine_in":
            return f"Order {order.number} is ready — we’ll bring it to table {order.table_number}."
        return f"Order {order.number} is ready at the {where} counter."
    if order.status in ("declined", "cancelled", "failed"):
        return (
            f"{where} couldn’t take order {order.number}. Any payment, gift card balance "
            "and stamps used have been returned."
        )
    if order.status == "refunded":
        return (
            f"Order {order.number} has been refunded. Any gift card balance and stamps used "
            "have been returned."
        )
    return ""


def after_status_change(order, previous):
    """Side effects of an app order moving on (BOS or till): refunds and the customer's feed."""
    if order.channel != "app" or order.status == previous:
        return
    if order.status in CLOSED and previous not in CLOSED:
        loyalty.reverse_order(order)
        payments.refund(order.payment_reference, order.total_cents)
    if text := status_message(order):
        notify(order.customer, "order", text, f"/orders/{order.pk}")


@transaction.atomic
def transition_order(order, status, request):
    order = Order.objects.select_for_update().get(pk=order.pk)
    if status not in TRANSITIONS[order.status]:
        raise DomainError(
            "invalid_transition", f"Order {order.number} is already {order.status}.", 409
        )
    before = snapshot(order)
    order.status = status
    order.handled_by = request.user
    order.handled_at = timezone.now()
    order.updated_by = request.user
    order.save()
    audit(request, order, before)
    after_status_change(order, before["status"])
    return order
