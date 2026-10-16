"""Chart geometry for the workspace, drawn by templates in plain CSS (no chart library)."""

import math


def nice_ceiling(value):
    """The smallest 2, 4, 5, 6, 8 or 10 × 10ⁿ at or above value, so the axis reads as a scale."""
    if value <= 2:
        return 2
    base = 10 ** math.floor(math.log10(value))
    for step in (2, 4, 6, 8, 10) if base == 1 else (2, 4, 5, 6, 8, 10):
        if value <= step * base:
            return step * base
    return 10 * base


def pct(value, total):
    """A CSS-safe percentage string; never localised, never above 100."""
    return f"{min(100.0, value * 100 / total):.2f}" if total else "0.00"


def column_chart(points, unit="booking", money=False):
    """
    Bars against a clean ceiling with three ticks.

    `points` are dicts with `label` (axis), `tip` (tooltip prefix), `value` and
    optional `highlight`. Labels thin out from the newest bar backwards so the
    latest point is always named. `money`: values are whole dollars.
    """
    top = nice_ceiling(max((p["value"] for p in points), default=0))
    every = 1 if len(points) <= 10 else 2 if len(points) <= 16 else 5 if len(points) <= 40 else 7
    bars = []
    for index, point in enumerate(points):
        value = point["value"]
        bars.append(
            {
                "pct": pct(value, top),
                "label": point["label"] if (len(points) - 1 - index) % every == 0 else "",
                "tip": f"{point['tip']}: ${value:,}"
                if money
                else f"{point['tip']}: {value:,} {unit}{'' if value == 1 else 's'}",
                "empty": not value,
                "today": point.get("highlight", False),
            }
        )
    sign = "$" if money else ""
    ticks = [{"pct": p, "text": f"{sign}{top * p // 100:,}"} for p in (100, 50, 0)]
    return {"bars": bars, "ticks": ticks, "is_empty": not any(p["value"] for p in points)}


def share_rows(rows, total=None):
    """Ranked bar rows: each value as a share of the total (or of the largest row)."""
    rows = list(rows)
    basis = total if total is not None else max((row["value"] for row in rows), default=0)
    whole = sum(row["value"] for row in rows)
    return [
        {
            **row,
            "pct": pct(row["value"], basis),
            "share": round(row["value"] * 100 / whole) if whole else 0,
        }
        for row in rows
    ]


def delta(current, previous):
    """Change against the previous period, or None when there is nothing to compare with."""
    if not previous:
        return None
    change = round((current - previous) * 100 / previous)
    return {
        "pct": abs(change),
        "direction": "up" if change > 0 else "down" if change < 0 else "flat",
    }
