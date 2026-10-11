"""One field-widget policy for every admin form.

Django sizes each widget from its own history rather than the page (a 196px text
box, a size="10" date box, a 40-column textarea, an unstyled number input), so a
form reads as five different widths. Every control here lands on one of two
widths, and dates/times use the browser's own pickers, which cannot hold an
impossible value. Subclasses that need an extra entry spread the table:

    formfield_overrides = {**BOS_FORMFIELD_OVERRIDES, models.TextField: {...}}
"""

from django import forms
from django.db import models

FIELD = "bos-field"
FIELD_SHORT = "bos-field bos-field-sm"
DATE_ECHO = "bos-date-echo-source"  # admin.js spells the chosen date out underneath

DATE_INPUT_FORMATS = ("%Y-%m-%d", "%d/%m/%Y")
DATETIME_INPUT_FORMATS = ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y %H:%M")
TIME_INPUT_FORMATS = ("%H:%M", "%H:%M:%S")


def with_class(attrs, css):
    merged = dict(attrs or {})
    merged["class"] = f"{css} {merged.get('class', '')}".strip()
    return merged


class DateInput(forms.DateInput):
    input_type = "date"

    def __init__(self, attrs=None, format=None):
        super().__init__(with_class(attrs, f"{FIELD_SHORT} {DATE_ECHO}"), format="%Y-%m-%d")


class TimeInput(forms.TimeInput):
    input_type = "time"

    def __init__(self, attrs=None, format=None):
        super().__init__(with_class(attrs, FIELD_SHORT), format="%H:%M")


class DateTimeInput(forms.DateTimeInput):
    input_type = "datetime-local"

    def __init__(self, attrs=None, format=None):
        super().__init__(with_class(attrs, f"{FIELD} {DATE_ECHO}"), format="%Y-%m-%dT%H:%M")


class TextInput(forms.TextInput):
    def __init__(self, attrs=None):
        super().__init__(with_class(attrs, f"{FIELD} vTextField"))


class EmailInput(forms.EmailInput):
    def __init__(self, attrs=None):
        super().__init__(with_class(attrs, f"{FIELD} vTextField"))


class URLInput(forms.URLInput):
    def __init__(self, attrs=None):
        super().__init__(with_class(attrs, f"{FIELD} vURLField"))


class NumberInput(forms.NumberInput):
    def __init__(self, attrs=None):
        super().__init__(with_class(attrs, f"{FIELD_SHORT} vIntegerField"))


class Textarea(forms.Textarea):
    def __init__(self, attrs=None):
        merged = with_class(attrs, f"{FIELD} vLargeTextField")
        merged.setdefault("rows", 4)
        super().__init__(merged)


class JSONTextarea(Textarea):
    def __init__(self, attrs=None):
        super().__init__(
            with_class({"rows": 6, "spellcheck": "false", **(attrs or {})}, "bos-json")
        )


BOS_FORMFIELD_OVERRIDES = {
    models.DateField: {"widget": DateInput, "input_formats": DATE_INPUT_FORMATS},
    models.DateTimeField: {
        # Resets Django's SplitDateTimeField, which expects two values.
        "form_class": forms.DateTimeField,
        "widget": DateTimeInput,
        "input_formats": DATETIME_INPUT_FORMATS,
    },
    models.TimeField: {"widget": TimeInput, "input_formats": TIME_INPUT_FORMATS},
    models.TextField: {"widget": Textarea},
    models.JSONField: {"widget": JSONTextarea},
    models.CharField: {"widget": TextInput},
    models.SlugField: {"widget": TextInput},
    models.EmailField: {"widget": EmailInput},
    models.URLField: {"widget": URLInput, "assume_scheme": "https"},
    models.IntegerField: {"widget": NumberInput},
    models.PositiveIntegerField: {"widget": NumberInput},
    models.PositiveSmallIntegerField: {"widget": NumberInput},
    models.SmallIntegerField: {"widget": NumberInput},
    models.BigIntegerField: {"widget": NumberInput},
    models.FloatField: {"widget": NumberInput},
    models.DecimalField: {"widget": NumberInput},
}


class MediaPicker(forms.Widget):
    """Choose a Media library photo by its picture; admin.js opens the thumbnail grid."""

    template_name = "admin/widgets/bos_media_picker.html"

    def get_context(self, name, value, attrs):
        from django.core.exceptions import ValidationError
        from django.urls import reverse

        from apps.media.admin import preview_url
        from apps.media.models import MediaAsset

        context = super().get_context(name, value, attrs)
        try:
            asset = MediaAsset.objects.filter(pk=value).first() if value else None
        except (ValidationError, ValueError):
            asset = None
        context["widget"].update(
            asset=asset,
            thumb=preview_url(asset, "thumb") if asset else "",
            source=reverse("admin:bos_media_picker"),
        )
        return context

    def render(self, name, value, attrs=None, renderer=None):
        from django.template.loader import render_to_string
        from django.utils.safestring import mark_safe

        # The form renderer only looks in app templates; this one lives in the project.
        return mark_safe(render_to_string(self.template_name, self.get_context(name, value, attrs)))
