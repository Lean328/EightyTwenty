"""Building blocks for the readable record pages (order, booking, enquiry, customer)."""

import re
from datetime import datetime

from django.core.exceptions import FieldDoesNotExist
from django.utils import timezone
from django.utils.dateformat import format as date_format
from django.utils.html import format_html

from .models import AuditLog
from .templatetags.bos_admin import STATUS_LABELS, STATUS_TONES

QUIET_FIELDS = {"id", "updated_at", "updated_by", "created_at", "created_by"}


def aud(cents):
    return f"${(cents or 0) / 100:,.2f}"


def status_label(value):
    return STATUS_LABELS.get(value, str(value).replace("_", " ").capitalize())


def person(user):
    return (user.get_full_name() or user.email) if user else ""


def tel(phone):
    """A tel: link for a phone number as typed (spaces, brackets and dashes dropped)."""
    digits = re.sub(r"[^\d+]", "", phone or "")
    return f"tel:{digits}" if digits else ""


def contact(phone="", email="", subject=""):
    """Phone and email as one-tap links, the way the team reaches a guest."""
    rows = []
    if phone:
        rows.append({"icon": "smartphone", "text": phone, "href": tel(phone)})
    if email:
        query = f"?subject={subject.replace(' ', '%20')}" if subject else ""
        rows.append({"icon": "mail", "text": email, "href": f"mailto:{email}{query}"})
    return rows


def facts(*rows):
    """(label, value[, href]) rows for a facts list; empty values are left out."""
    return [
        {"label": row[0], "value": row[1], "href": row[2] if len(row) > 2 else ""}
        for row in rows
        if row[1] not in (None, "", [])
    ]


def moment(at):
    """'Tue 20 Oct, 9:30 AM' in café time."""
    return date_format(timezone.localtime(at), "D j M, g:i A") if at else ""


def relative_day(day):
    """'Today', 'Tomorrow', 'In 5 days', '3 days ago' against café time."""
    delta = (day - timezone.localdate()).days
    if delta == 0:
        return "Today"
    if delta == 1:
        return "Tomorrow"
    if delta == -1:
        return "Yesterday"
    return f"In {delta} days" if delta > 0 else f"{-delta} days ago"


def chip(text, tone="quiet"):
    return format_html('<span class="bos-chip bos-tone-{}">{}</span>', tone, text)


def tag(text, tone="quiet"):
    return format_html('<span class="bos-tag bos-tone-{}">{}</span>', tone, text)


def parse_at(value):
    """A timestamp written by a client (ISO text) as an aware datetime, or None."""
    try:
        at = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return at if timezone.is_aware(at) else timezone.make_aware(at)


def step(at, title, who="", tone="quiet"):
    return {"at": at, "title": title, "who": who, "tone": tone}


def audit_steps(obj):
    """Changes the team made to a record, read from the activity log, oldest first."""
    rows = (
        AuditLog.objects.filter(entity_type=obj._meta.label_lower, entity_id=str(obj.pk))
        .exclude(before=None)
        .select_related("actor")
        .order_by("created_at")
    )
    steps = []
    for row in rows:
        before, after = row.before or {}, row.after or {}
        status = after.get("status")
        if status and before.get("status") != status:
            title = status_label(status)
            tone = STATUS_TONES.get(status, "info")
        else:
            changed = [
                key
                for key in after
                if key not in QUIET_FIELDS and before.get(key) != after.get(key)
            ]
            if not changed:
                continue
            title = "Updated " + ", ".join(field_label(obj, key) for key in changed[:3])
            tone = "info"
        steps.append(step(row.created_at, title, person(row.actor), tone))
    return steps


def field_label(obj, name):
    try:
        return str(obj._meta.get_field(name).verbose_name)
    except FieldDoesNotExist:
        return name.replace("_", " ")


def timeline(*groups):
    """Merge steps from several sources into one list, oldest first."""
    steps = [s for group in groups for s in group if s and s["at"]]
    return sorted(steps, key=lambda s: s["at"])
