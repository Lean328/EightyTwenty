from decimal import Decimal

from django import forms
from rest_framework.exceptions import ValidationError as APIValidationError

from .admin_widgets import NumberInput


class AUDField(forms.DecimalField):
    """Dollars in forms, integer cents in storage and API responses."""

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("decimal_places", 2)
        kwargs.setdefault("max_digits", 10)
        kwargs.setdefault("max_value", Decimal("21474836.47"))
        kwargs.setdefault("min_value", Decimal("-21474836.48"))
        kwargs.setdefault("help_text", "Enter an amount in Australian dollars, e.g. 12.50.")
        kwargs.setdefault("widget", NumberInput(attrs={"step": "0.01", "inputmode": "decimal"}))
        super().__init__(*args, **kwargs)

    def prepare_value(self, value):
        if isinstance(value, int):
            return f"{Decimal(value) / 100:.2f}"
        return super().prepare_value(value)

    def clean(self, value):
        amount = super().clean(value)
        return int(amount * 100) if amount is not None else None


class ValidatedAdminForm(forms.ModelForm):
    """Keep CMS object and field validation consistent with the API."""

    serializer_class = None
    object_validation_method = "validate"

    def clean(self):
        data = super().clean()
        serializer = self.serializer_class(
            instance=self.instance if not self.instance._state.adding else None
        )
        try:
            for name, value in list(data.items()):
                validator = getattr(serializer, f"validate_{name}", None)
                if validator:
                    data[name] = validator(value)
            getattr(serializer, self.object_validation_method)(data)
        except APIValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict):
                for name, messages in detail.items():
                    self.add_error(
                        name if name in self.fields else None,
                        forms.ValidationError(
                            [str(v) for v in messages]
                            if isinstance(messages, list)
                            else str(messages)
                        ),
                    )
            else:
                self.add_error(
                    None,
                    forms.ValidationError(
                        [str(v) for v in detail] if isinstance(detail, list) else str(detail)
                    ),
                )
        return data
