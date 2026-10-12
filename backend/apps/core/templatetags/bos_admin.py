from django import template
from django.templatetags.static import static
from django.utils import timezone
from django.utils.html import format_html

register = template.Library()

ICON_SPRITE = "bos/img/icons.svg"
STATUS_TONES = {
    "requested": "warn",
    "confirmed": "good",
    "seated": "live",
    "open": "good",
    "new": "warn",
    "in_progress": "info",
    "quoted": "info",
    "won": "good",
    "declined": "bad",
    "cancelled": "quiet",
    "no_show": "bad",
    "closed": "quiet",
    "draft": "quiet",
    "published": "good",
    "tbc": "warn",
    "lost": "quiet",
    "sent": "good",
    "failed": "bad",
    "pending": "warn",
    "sending": "info",
    "received": "warn",
    "preparing": "info",
    "ready": "live",
    "completed": "good",
}
STATUS_LABELS = {"no_show": "No-show", "tbc": "TBC"}


@register.simple_tag
def icon(name, extra=""):
    """One glyph from the workspace sprite; it takes its colour from the text beside it."""
    return format_html(
        '<svg class="{}" aria-hidden="true" focusable="false"><use href="{}#{}"></use></svg>',
        f"bos-i {extra}".strip(),
        static(ICON_SPRITE),
        name,
    )


@register.filter
def status_badge(value):
    value = str(value)
    label = STATUS_LABELS.get(value, value.replace("_", " ").capitalize())
    return format_html(
        '<span class="bos-chip bos-tone-{}">{}</span>', STATUS_TONES.get(value, "quiet"), label
    )


@register.filter
def initials(user):
    first = (getattr(user, "first_name", "") or "").strip()
    last = (getattr(user, "last_name", "") or "").strip()
    if first or last:
        return ((first[:1] + last[:1]) if first and last else (first or last)[:2]).upper()
    return (getattr(user, "email", "") or "?")[:2].upper()


@register.simple_tag
def greeting():
    hour = timezone.localtime().hour
    if hour < 12:
        return "Good morning"
    if hour < 17:
        return "Good afternoon"
    return "Good evening"


@register.filter
def aud(cents):
    """Integer cents as dollars for display; the database keeps cents."""
    return "—" if cents is None else f"${cents / 100:,.2f}"


def boolean_chip(value):
    """Yes / No as a small chip in the workspace palette instead of Django's icons."""
    state, label = {True: ("yes", "Yes"), False: ("no", "No")}.get(value, ("unknown", "—"))
    return format_html('<span class="bos-bool is-{}">{}</span>', state, label)
