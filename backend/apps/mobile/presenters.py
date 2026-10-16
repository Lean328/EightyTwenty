"""Models → the app's wire shapes (see serializers.py for the documented fields)."""

from django.utils import timezone

from apps.locations.services import weekly_hours
from apps.loyalty.models import STAMPS_PER_REWARD
from apps.loyalty.services import ELIGIBILITY, REWARD

APP_PREFERENCE_DEFAULTS = {
    "dietary": [],
    "notifications": {
        "orderUpdates": True,
        "bookings": True,
        "coffeeCard": True,
        "offersAndNews": False,
        "giftCardActivity": True,
    },
    "security": {"biometricSignIn": True, "useLocation": True, "rememberOrderSettings": True},
    "avatar": 0,
}
DEFAULT_HOME_CAFE = "phillip"
BOOKING_STATUS = {
    "requested": "requested",
    "confirmed": "confirmed",
    "seated": "confirmed",
    "declined": "cancelled",
    "cancelled": "cancelled",
    "no_show": "cancelled",
}
ENQUIRY_STATUS = {
    "new": "enquiry_sent",
    "in_progress": "enquiry_sent",
    "quoted": "quoted",
    "won": "confirmed",
    "lost": "closed",
    "closed": "closed",
}


def iso(moment):
    return timezone.localtime(moment).isoformat(timespec="seconds") if moment else None


def image_url(asset):
    """Phone-sized photo: the 800 px WebP (about 2× a full-width phone screen)."""
    if not asset:
        return None
    url = asset.variants.get("md") or asset.variants.get("lg") or ""
    # Website-relative paths (img/...) mean the photo never reached Storage: useless to the app.
    return url if url.startswith("http") else None


def full_name(user):
    return " ".join(part for part in [user.first_name, user.last_name] if part)


def customer(user):
    return {
        "id": str(user.pk),
        "name": full_name(user),
        "email": user.email,
        "phone": user.phone,
        "memberSince": timezone.localdate(user.date_joined).isoformat(),
    }


def preferences(profile, home_cafe_slug):
    stored = profile.app_preferences or {}
    return {
        "homeCafeId": home_cafe_slug,
        "dietary": stored.get("dietary", APP_PREFERENCE_DEFAULTS["dietary"]),
        "notifications": {
            **APP_PREFERENCE_DEFAULTS["notifications"],
            **stored.get("notifications", {}),
        },
        "security": {**APP_PREFERENCE_DEFAULTS["security"], **stored.get("security", {})},
        "avatar": stored.get("avatar", APP_PREFERENCE_DEFAULTS["avatar"]),
    }


def address(row):
    return {"id": str(row.pk), "label": row.label, "line": row.line}


def location(row):
    images = sorted(row.images.all(), key=lambda image: image.position)
    hero = next((image for image in images if image.position == 0), None)
    week = weekly_hours(row)
    return {
        "id": row.slug,
        "name": row.name,
        "subtitle": row.subtitle,
        "area": row.area or row.subtitle,
        "headline": row.headline,
        "address": row.address,
        "phone": row.phone or None,
        "email": row.email or None,
        "hoursLabel": row.hours_text,
        "hoursShort": row.hours_short_text,
        "weeklyHours": week,
        "status": "open" if week else "coming_soon",
        "fulfilmentMethods": [
            m for m in row.fulfilment_methods if m in ("pickup", "delivery", "dine_in")
        ],
        "note": row.note,
        "waitLabel": row.wait_text or None,
        "imageUrl": image_url(hero.asset) if hero else None,
        "galleryUrls": [
            url for image in images if image is not hero and (url := image_url(image.asset))
        ],
        "externalOrderUrl": row.external_order_url or None,
        "bookingLabel": row.booking_label,
        "flags": {
            "flagship": row.is_flagship,
            "limitedMenu": row.is_limited_menu,
            "glutenFree": row.is_gluten_free,
        },
    }


def category(row):
    return {
        "id": row.slug,
        "name": row.name,
        "shortName": row.short_name or row.name,
        "note": row.note,
    }


def menu_item(entry):
    item = entry.item
    return {
        "id": item.slug,
        "categoryId": item.category.slug,
        "name": item.name,
        "description": item.description,
        "priceCents": entry.price_cents,
        "dietary": [link.tag.code for link in item.dietary_links.all()],
        "imageUrl": image_url(item.image),
        "featured": item.is_featured,
        "modifierGroups": [
            {
                "id": group.code,
                "name": group.name,
                "required": group.required,
                "maxSelections": group.max_select,
                "options": [{"name": name, "priceCents": price} for name, price in group.options],
            }
            for group in entry.groups
        ],
    }


def totals(values):
    return {
        "subtotalCents": values["subtotal"],
        "deliveryCents": values["delivery"],
        "rewardCents": values["reward"],
        "surchargeCents": values["surcharge"],
        "giftCardCents": values["gift_card"],
        "totalCents": values["total"],
    }


# The app knows six statuses; a till cancelling or refunding an app order reads as declined.
APP_STATUS = {"cancelled": "declined", "refunded": "declined", "failed": "declined"}


def order(row):
    return {
        "id": str(row.pk),
        "number": row.number,
        "locationId": row.location.slug,
        "locationName": row.location.name,
        "method": row.method,
        "status": APP_STATUS.get(row.status, row.status),
        "createdAt": iso(row.created_at),
        "timing": {"type": "scheduled", "time": row.scheduled_time.strftime("%H:%M")}
        if row.scheduled_time
        else {"type": "asap", "time": None},
        "deliveryAddress": row.delivery_address or None,
        "tableNumber": row.table_number or None,
        "lines": [
            {
                "itemId": line.item_slug,
                "name": line.name,
                "qty": line.qty,
                "unitPriceCents": line.unit_price_cents,
                "selections": line.selections,
                "modifiersLabel": line.modifiers_label,
                "note": line.note,
            }
            for line in row.lines.all()
            if line.qty
        ],
        "totals": {
            "subtotalCents": row.subtotal_cents,
            "deliveryCents": row.delivery_cents,
            "rewardCents": row.reward_cents,
            "surchargeCents": row.surcharge_cents,
            "giftCardCents": row.gift_card_cents,
            "totalCents": row.total_cents,
        },
        "paymentLabel": row.payment_label,
        "stampsEarned": row.stamps_earned,
        "rewardRedeemed": row.reward_redeemed,
        "estimatedWait": row.estimated_wait,
    }


def quote(priced, values):
    return {
        "lines": [
            {
                "itemId": row["entry"].item.slug,
                "name": row["entry"].item.name,
                "qty": row["qty"],
                "unitPriceCents": row["unit"],
                "modifiersLabel": row["label"],
            }
            for row in priced
        ],
        "totals": totals(values),
        "rewardAvailable": values["reward_available"],
        "coffeeCount": values["coffee_count"],
        "itemCount": values["item_count"],
    }


def loyalty_card(card):
    return {
        "stamps": card.stamps,
        "stampsPerReward": STAMPS_PER_REWARD,
        "memberNumber": card.member_number,
        "eligibility": ELIGIBILITY,
        "rewardDescription": REWARD,
        "walletPassAdded": card.wallet_pass_added,
    }


def loyalty_activity(row):
    return {
        "id": str(row.pk),
        "type": row.type,
        "description": row.description,
        "locationName": row.location_name,
        "occurredAt": iso(row.created_at),
    }


def reservation(row):
    return {
        "id": str(row.pk),
        "locationId": row.location.slug,
        "date": row.date.isoformat(),
        "time": row.time.strftime("%H:%M"),
        "guests": row.party_size,
        "seating": row.seating or "indoor",
        "status": BOOKING_STATUS[row.status],
        "createdAt": iso(row.created_at),
    }


def price_label(cents):
    return f"${cents / 100:.2f}".removesuffix(".00")


def catering_package(row):
    return {
        "id": row.slug,
        "name": row.name,
        "pricePerPersonCents": row.price_cents,
        "priceLabel": price_label(row.price_cents),
        "unit": row.unit,
        "imageUrl": image_url(row.image),
        "imagePosition": row.image_position,
        "blurb": row.blurb,
        "inclusions": row.items,
    }


def catering_enquiry(row):
    return {
        "id": str(row.pk),
        "packageId": row.package.slug if row.package else "",
        "packageName": row.package.name if row.package else "Catering",
        "guests": row.headcount,
        "date": row.event_date.isoformat() if row.event_date else None,
        "occasion": (row.payload or {}).get("occasion") or "Catering",
        "status": ENQUIRY_STATUS.get(row.status, "enquiry_sent"),
        "createdAt": iso(row.created_at),
    }


def gift_card(card):
    return {"last4": card.last4, "balanceCents": card.balance_cents}


def gift_activity(row):
    return {
        "id": str(row.pk),
        "kind": row.kind,
        "description": row.description,
        "amountCents": row.amount_cents,
        "occurredAt": iso(row.created_at),
    }


def notification(row):
    return {
        "id": str(row.pk),
        "kind": row.kind,
        "text": row.text,
        "createdAt": iso(row.created_at),
        "unread": row.unread,
    }


def offer(row):
    return {
        "id": row.slug,
        "name": row.name,
        "tag": row.tag,
        "line": row.line,
        "fine": row.fine,
        "imageUrl": image_url(row.image),
    }


def faq(row):
    return {"question": row.question, "answer": row.answer}
