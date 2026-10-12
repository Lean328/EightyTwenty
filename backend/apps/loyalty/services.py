"""
Coffee card and gift card rules, ported from the mobile app (src/domain/loyalty.ts) so the
server and the app agree on every stamp and every cent.
"""

import re

from django.db import transaction

from apps.notifications.services import notify

from .models import STAMPS_PER_REWARD, GiftCard, GiftCardActivity, LoyaltyActivity, LoyaltyCard

ELIGIBILITY = "Any coffee or hot drink, any size, at any EightyTwenty café."
REWARD = "Your 10th coffee is free."
_NOT_COFFEE = re.compile(r"puppychino|add ons", re.I)
_COLD_COFFEE = re.compile(r"coffee|latte|long black|mocha|cold brew", re.I)


def is_coffee(category_slug, name):
    """Earns a stamp and can be the free coffee (app: isCoffeeItem)."""
    if category_slug == "coffee":
        return not _NOT_COFFEE.search(name)
    return category_slug == "cold" and bool(_COLD_COFFEE.search(name))


def stamps_after_order(stamps, coffee_count, reward_redeemed):
    """Redeeming resets the card, the free coffee earns nothing, the card caps at 9."""
    base = 0 if reward_redeemed else stamps
    earned_raw = max(0, coffee_count - (1 if reward_redeemed else 0))
    after = min(STAMPS_PER_REWARD, base + earned_raw)
    return after, max(0, after - base)


def plural(count, word):
    return f"{count} {word}{'' if count == 1 else 's'}"


def card_for(user, lock=False):
    qs = LoyaltyCard.objects.select_for_update() if lock else LoyaltyCard.objects
    card = qs.filter(user=user).first()
    if card is None:
        for _ in range(5):  # member numbers are random; retry the rare clash
            number = LoyaltyCard._meta.get_field("member_number").default()
            if not LoyaltyCard.objects.filter(member_number=number).exists():
                break
        card = LoyaltyCard.objects.create(user=user, member_number=number)
    return card


def gift_card_for(user, lock=False):
    qs = GiftCard.objects.select_for_update() if lock else GiftCard.objects
    return qs.filter(user=user).first() or GiftCard.objects.create(user=user)


def apply_order(card, gift, order):
    """Stamps, reward and gift card spend for an accepted order (cards already locked)."""
    if order.reward_redeemed:
        card.stamps = 0
        LoyaltyActivity.objects.create(
            card=card,
            type="redeem",
            description="Free coffee redeemed",
            location_name=order.location.name,
        )
    if order.stamps_earned:
        card.stamps = min(STAMPS_PER_REWARD, card.stamps + order.stamps_earned)
        LoyaltyActivity.objects.create(
            card=card,
            type="earn",
            description=f"+{plural(order.stamps_earned, 'stamp')} · order {order.number}",
            location_name=order.location.name,
        )
        to_go = STAMPS_PER_REWARD - card.stamps
        notify(
            order.customer,
            "loyalty",
            "Your free coffee is ready to redeem."
            if to_go == 0
            else f"Stamp added — {to_go} more until your free coffee.",
        )
    card.save(update_fields=["stamps", "updated_at"])
    if order.gift_card_cents:
        gift.balance_cents = max(0, gift.balance_cents - order.gift_card_cents)
        gift.save(update_fields=["balance_cents", "updated_at"])
        GiftCardActivity.objects.create(
            card=gift,
            kind="spent",
            description=f"Used on order {order.number}",
            amount_cents=order.gift_card_cents,
        )


@transaction.atomic
def reverse_order(order):
    """A café declined an accepted order: give back stamps, the free coffee and gift card spend."""
    card = card_for(order.customer, lock=True)
    if order.stamps_earned or order.reward_redeemed:
        restored = STAMPS_PER_REWARD if order.reward_redeemed else 0
        card.stamps = max(0, min(STAMPS_PER_REWARD, card.stamps - order.stamps_earned + restored))
        card.save(update_fields=["stamps", "updated_at"])
        if order.stamps_earned:
            LoyaltyActivity.objects.create(
                card=card,
                type="redeem",
                description=f"Stamps reversed · order {order.number} was declined",
                location_name=order.location.name,
            )
        if order.reward_redeemed:
            LoyaltyActivity.objects.create(
                card=card,
                type="earn",
                description=f"Free coffee returned · order {order.number} was declined",
                location_name=order.location.name,
            )
    if order.gift_card_cents:
        gift = gift_card_for(order.customer, lock=True)
        gift.balance_cents += order.gift_card_cents
        gift.save(update_fields=["balance_cents", "updated_at"])
        GiftCardActivity.objects.create(
            card=gift,
            kind="added",
            description=f"Refunded from order {order.number}",
            amount_cents=order.gift_card_cents,
        )


def record_stamp_change(card, before, location_name="In store"):
    """Staff edited a card in BOS (e.g. a stamp at the counter): keep the history honest."""
    if card.stamps > before:
        LoyaltyActivity.objects.create(
            card=card,
            type="earn",
            description=f"+{plural(card.stamps - before, 'stamp')} · in store",
            location_name=location_name,
        )
        notify(
            card.user,
            "loyalty",
            f"Stamp added — {STAMPS_PER_REWARD - card.stamps} more until your free coffee.",
        )
    elif card.stamps < before:
        LoyaltyActivity.objects.create(
            card=card,
            type="redeem",
            description="Free coffee redeemed"
            if card.stamps == 0
            else "Stamps adjusted by the team",
            location_name=location_name,
        )


def record_balance_change(gift, before):
    """Chain owner topped up (or corrected) a gift card in BOS."""
    difference = gift.balance_cents - before
    if difference > 0:
        GiftCardActivity.objects.create(
            card=gift, kind="added", description="Added to your balance", amount_cents=difference
        )
        notify(
            gift.user, "gift_card", f"${difference / 100:.2f} was added to your gift card balance."
        )
    elif difference < 0:
        GiftCardActivity.objects.create(
            card=gift,
            kind="spent",
            description="Balance adjusted by the team",
            amount_cents=-difference,
        )
