"""
Wire shapes of the mobile app API (EightyTwentyMobile/src/services/api/dto.ts): camelCase,
money in integer cents, timestamps ISO-8601 with the Canberra offset.

Input serializers carry the app's approved error copy. Output serializers document the
responses (and pass presenter dicts through unchanged, so a missing key fails loudly).
"""

import re

from rest_framework import serializers

EMAIL_LOOSE = re.compile(r"^\S+@\S+\.\S+$")
EMAIL_STRICT = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
METHODS = ["pickup", "delivery", "dine_in"]
PAYMENT_CHOICES = ["apple_pay", "saved_card", "new_card"]
DIETARY = ["gluten_free", "dairy_free", "vegan", "vegetarian"]
DIETARY_LABELS = ["Gluten free", "Dairy free", "Vegan", "Vegetarian"]
GIFT_AMOUNTS = [2500, 5000, 7500, 10000]


def digits(value):
    return len(re.findall(r"\d", value or ""))


def problem(message, code="invalid"):
    return serializers.ValidationError(message, code=code)


def text(message, **kwargs):
    """A required string whose missing/blank errors use the app's copy."""
    return serializers.CharField(
        error_messages={"required": message, "blank": message, "null": message}, **kwargs
    )


# ---------------------------------------------------------------- input


class SignInIn(serializers.Serializer):
    email = text("Enter a valid email address.", max_length=254)
    password = text(
        "Your password needs at least 6 characters.", max_length=128, trim_whitespace=False
    )

    def validate_email(self, value):
        if not EMAIL_LOOSE.match(value.strip()):
            raise problem("Enter a valid email address.")
        return value.strip().lower()

    def validate_password(self, value):
        if len(value) < 6:
            raise problem("Your password needs at least 6 characters.", "min_length")
        return value


class SignUpIn(SignInIn):
    name = text("Add your full name.", max_length=200)
    phone = text("Add a mobile number.", max_length=32)

    def validate_phone(self, value):
        if digits(value) < 8:
            raise problem("Add a mobile number.")
        return value.strip()


class RefreshIn(serializers.Serializer):
    refreshToken = serializers.CharField(max_length=4096)


class SignOutIn(serializers.Serializer):
    refreshToken = serializers.CharField(max_length=4096, allow_null=True, required=False)


class PasswordChangeIn(serializers.Serializer):
    currentPassword = text("Enter your current password.", max_length=128, trim_whitespace=False)
    newPassword = text(
        "Your new password needs at least 10 characters.", max_length=128, trim_whitespace=False
    )


class EmailIn(serializers.Serializer):
    email = text("Enter a valid email address.", max_length=254)

    def validate_email(self, value):
        if not EMAIL_LOOSE.match(value.strip()):
            raise problem("Enter a valid email address.")
        return value.strip().lower()


class ProfileIn(serializers.Serializer):
    name = text("Add your name.", max_length=200, required=False)
    email = text("Enter a valid email address.", max_length=254, required=False)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)

    def validate_email(self, value):
        if not EMAIL_LOOSE.match(value.strip()):
            raise problem("Enter a valid email address.")
        return value.strip().lower()

    def validate_phone(self, value):
        if value.strip() and digits(value) < 8:
            raise problem("Add a mobile number.")
        return value.strip()


class NotificationPrefs(serializers.Serializer):
    orderUpdates = serializers.BooleanField()
    bookings = serializers.BooleanField()
    coffeeCard = serializers.BooleanField()
    offersAndNews = serializers.BooleanField()
    giftCardActivity = serializers.BooleanField()


class SecurityPrefs(serializers.Serializer):
    biometricSignIn = serializers.BooleanField()
    useLocation = serializers.BooleanField()
    rememberOrderSettings = serializers.BooleanField()


class PreferencesIn(serializers.Serializer):
    homeCafeId = serializers.CharField(max_length=50, required=False)
    dietary = serializers.ListField(
        child=serializers.ChoiceField(choices=DIETARY), max_length=4, required=False
    )
    notifications = NotificationPrefs(required=False)
    security = SecurityPrefs(required=False)
    avatar = serializers.IntegerField(min_value=0, max_value=5, required=False)


class AddressIn(serializers.Serializer):
    label = serializers.ChoiceField(choices=["home", "work", "other"])
    line = text("Add an address.", max_length=300)


class TimingIn(serializers.Serializer):
    type = serializers.ChoiceField(choices=["asap", "scheduled"])
    time = serializers.TimeField(format="%H:%M", input_formats=["%H:%M"], required=False)

    def validate(self, attrs):
        if attrs["type"] == "scheduled" and not attrs.get("time"):
            raise serializers.ValidationError(
                {"time": problem("Choose a pickup time.", "required")}
            )
        return attrs


class LineIn(serializers.Serializer):
    itemId = serializers.CharField(max_length=50)
    qty = serializers.IntegerField(min_value=1, max_value=99)
    selections = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField(max_length=120), max_length=40),
        required=False,
        default=dict,
    )
    note = serializers.CharField(max_length=500, allow_blank=True, required=False, default="")


class PaymentIn(serializers.Serializer):
    choice = serializers.ChoiceField(choices=PAYMENT_CHOICES)
    paymentMethodId = serializers.CharField(max_length=100, required=False, allow_blank=True)
    token = serializers.CharField(max_length=4096, required=False, allow_blank=True)


class QuotePaymentIn(serializers.Serializer):
    choice = serializers.ChoiceField(choices=PAYMENT_CHOICES)


class QuoteIn(serializers.Serializer):
    locationId = serializers.CharField(max_length=50)
    method = serializers.ChoiceField(choices=METHODS)
    deliveryAddress = serializers.CharField(
        max_length=300, allow_null=True, allow_blank=True, required=False
    )
    tableNumber = serializers.CharField(
        max_length=20, allow_null=True, allow_blank=True, required=False
    )
    lines = LineIn(many=True, allow_empty=True, max_length=50)
    payment = QuotePaymentIn()
    useGiftCard = serializers.BooleanField(default=False)
    useReward = serializers.BooleanField(default=False)


class ContactIn(serializers.Serializer):
    name = serializers.CharField(max_length=160, allow_blank=True)
    phone = serializers.CharField(max_length=32, allow_blank=True)


class OrderIn(QuoteIn):
    timing = TimingIn()
    payment = PaymentIn()
    contact = ContactIn()
    expectedTotalCents = serializers.IntegerField(min_value=0)


class ReservationIn(serializers.Serializer):
    """Checked by views.validate_reservation so the errors follow the app's documented order."""

    locationId = serializers.CharField(max_length=50)
    date = serializers.CharField(max_length=20, allow_blank=True, required=False, default="")
    time = serializers.CharField(max_length=10, allow_blank=True, required=False, default="")
    guests = serializers.JSONField(required=False, allow_null=True, default=None)
    seating = serializers.ChoiceField(choices=["indoor", "outdoor"], default="indoor")
    name = serializers.CharField(max_length=160, allow_blank=True, required=False, default="")
    phone = serializers.CharField(max_length=32, allow_blank=True, required=False, default="")
    email = serializers.CharField(max_length=254, allow_blank=True, required=False, default="")
    notes = serializers.CharField(max_length=3000, allow_blank=True, required=False, default="")


class CateringEnquiryIn(serializers.Serializer):
    """Checked by views.validate_enquiry (package first, then every field)."""

    packageId = serializers.CharField(max_length=50, allow_blank=True)
    firstName = serializers.CharField(max_length=80, allow_blank=True, default="")
    lastName = serializers.CharField(max_length=80, allow_blank=True, default="")
    email = serializers.CharField(max_length=254, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32, allow_blank=True, default="")
    company = serializers.CharField(max_length=200, allow_blank=True, default="")
    occasion = serializers.CharField(max_length=200, allow_blank=True, default="")
    date = serializers.CharField(max_length=20, allow_null=True, allow_blank=True, default=None)
    time = serializers.CharField(max_length=10, allow_null=True, allow_blank=True, default=None)
    guests = serializers.JSONField(required=False, allow_null=True, default=None)
    location = serializers.CharField(max_length=300, allow_blank=True, default="")
    dietary = serializers.ListField(
        child=serializers.ChoiceField(choices=DIETARY_LABELS), max_length=4, default=list
    )
    notes = serializers.CharField(max_length=5000, allow_blank=True, default="")


class GiftSendIn(serializers.Serializer):
    amountCents = serializers.IntegerField()
    recipientName = serializers.CharField(max_length=160, allow_blank=True)
    recipientEmail = serializers.CharField(max_length=254, allow_blank=True)
    message = serializers.CharField(max_length=500, allow_blank=True, required=False, default="")
    paymentToken = serializers.CharField(
        max_length=4096, allow_blank=True, required=False, default=""
    )


class AddCardIn(serializers.Serializer):
    sourceToken = serializers.CharField(max_length=4096)


# ---------------------------------------------------------------- output


class ErrorDetailOut(serializers.Serializer):
    code = serializers.CharField(help_text="VALIDATION, NOT_FOUND, PRICE_CHANGED, ...")
    message = serializers.CharField(help_text="Customer-ready copy; show it as is.")
    fields = serializers.DictField(child=serializers.CharField())


class ErrorOut(serializers.Serializer):
    error = ErrorDetailOut()


class SessionOut(serializers.Serializer):
    customerId = serializers.CharField()
    accessToken = serializers.CharField(help_text="JWT, valid 15 minutes.")
    refreshToken = serializers.CharField(
        allow_null=True, help_text="Single use: every refresh returns a new one."
    )
    expiresAt = serializers.DateTimeField(allow_null=True)


class CustomerOut(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    email = serializers.CharField()
    phone = serializers.CharField()
    memberSince = serializers.DateField()


class PreferencesOut(serializers.Serializer):
    homeCafeId = serializers.CharField()
    dietary = serializers.ListField(child=serializers.ChoiceField(choices=DIETARY))
    notifications = NotificationPrefs()
    security = SecurityPrefs()
    avatar = serializers.IntegerField()


class FavouritesOut(serializers.Serializer):
    itemIds = serializers.ListField(child=serializers.CharField())


class AddressOut(serializers.Serializer):
    id = serializers.CharField()
    label = serializers.ChoiceField(choices=["home", "work", "other"])
    line = serializers.CharField()


class DayHoursOut(serializers.Serializer):
    open = serializers.CharField(help_text="HH:MM, café time")
    close = serializers.CharField(help_text="HH:MM, café time")


class WeeklyHoursOut(serializers.Serializer):
    sun = DayHoursOut(allow_null=True)
    mon = DayHoursOut(allow_null=True)
    tue = DayHoursOut(allow_null=True)
    wed = DayHoursOut(allow_null=True)
    thu = DayHoursOut(allow_null=True)
    fri = DayHoursOut(allow_null=True)
    sat = DayHoursOut(allow_null=True)


class FlagsOut(serializers.Serializer):
    flagship = serializers.BooleanField()
    limitedMenu = serializers.BooleanField()
    glutenFree = serializers.BooleanField()


class LocationOut(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    subtitle = serializers.CharField()
    area = serializers.CharField()
    headline = serializers.CharField()
    address = serializers.CharField()
    phone = serializers.CharField(allow_null=True)
    email = serializers.CharField(allow_null=True)
    hoursLabel = serializers.CharField()
    hoursShort = serializers.CharField()
    weeklyHours = WeeklyHoursOut(allow_null=True)
    status = serializers.ChoiceField(choices=["open", "coming_soon"])
    fulfilmentMethods = serializers.ListField(child=serializers.ChoiceField(choices=METHODS))
    note = serializers.CharField()
    waitLabel = serializers.CharField(allow_null=True)
    imageUrl = serializers.CharField(allow_null=True)
    galleryUrls = serializers.ListField(child=serializers.CharField())
    externalOrderUrl = serializers.CharField(allow_null=True)
    bookingLabel = serializers.CharField()
    flags = FlagsOut()
    latitude = serializers.FloatField(
        required=False, allow_null=True, help_text="Café position (WGS84); null until set in BOS."
    )
    longitude = serializers.FloatField(required=False, allow_null=True)


class CategoryOut(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    shortName = serializers.CharField()
    note = serializers.CharField()


class OptionOut(serializers.Serializer):
    name = serializers.CharField()
    priceCents = serializers.IntegerField()


class ModifierGroupOut(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    required = serializers.BooleanField()
    maxSelections = serializers.IntegerField(help_text="1 = single choice, 0 = any number")
    options = OptionOut(many=True)


class MenuItemOut(serializers.Serializer):
    id = serializers.CharField()
    categoryId = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    priceCents = serializers.IntegerField()
    dietary = serializers.ListField(
        child=serializers.CharField(),
        help_text="GF*, DF*, Gluten free, Dairy free, Vegan, Vegetarian",
    )
    imageUrl = serializers.CharField(allow_null=True)
    featured = serializers.BooleanField()
    modifierGroups = ModifierGroupOut(many=True)


class TimingOut(serializers.Serializer):
    type = serializers.ChoiceField(choices=["asap", "scheduled"])
    time = serializers.CharField(required=False, help_text="HH:MM; only when scheduled")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("time") is None:
            data.pop("time", None)
        return data


class OrderLineOut(serializers.Serializer):
    itemId = serializers.CharField()
    name = serializers.CharField()
    qty = serializers.IntegerField()
    unitPriceCents = serializers.IntegerField()
    selections = serializers.DictField(child=serializers.ListField(child=serializers.CharField()))
    modifiersLabel = serializers.CharField()
    note = serializers.CharField()


class TotalsOut(serializers.Serializer):
    subtotalCents = serializers.IntegerField()
    deliveryCents = serializers.IntegerField()
    rewardCents = serializers.IntegerField()
    surchargeCents = serializers.IntegerField()
    giftCardCents = serializers.IntegerField()
    totalCents = serializers.IntegerField()


class OrderOut(serializers.Serializer):
    id = serializers.CharField()
    number = serializers.CharField()
    locationId = serializers.CharField()
    locationName = serializers.CharField()
    method = serializers.ChoiceField(choices=METHODS)
    status = serializers.ChoiceField(
        choices=["received", "confirmed", "preparing", "ready", "completed", "declined"]
    )
    createdAt = serializers.DateTimeField()
    timing = TimingOut()
    deliveryAddress = serializers.CharField(allow_null=True)
    tableNumber = serializers.CharField(allow_null=True)
    lines = OrderLineOut(many=True)
    totals = TotalsOut()
    paymentLabel = serializers.CharField()
    stampsEarned = serializers.IntegerField()
    rewardRedeemed = serializers.BooleanField()
    estimatedWait = serializers.CharField()


class OrderPageOut(serializers.Serializer):
    items = OrderOut(many=True)
    nextCursor = serializers.CharField(allow_null=True)


class QuoteLineOut(serializers.Serializer):
    itemId = serializers.CharField()
    name = serializers.CharField()
    qty = serializers.IntegerField()
    unitPriceCents = serializers.IntegerField()
    modifiersLabel = serializers.CharField()


class QuoteOut(serializers.Serializer):
    lines = QuoteLineOut(many=True)
    totals = TotalsOut()
    rewardAvailable = serializers.BooleanField()
    coffeeCount = serializers.IntegerField()
    itemCount = serializers.IntegerField()


class SavedCardOut(serializers.Serializer):
    id = serializers.CharField()
    brand = serializers.ChoiceField(choices=["visa", "mastercard", "amex", "jcb", "other"])
    last4 = serializers.CharField()
    expMonth = serializers.IntegerField()
    expYear = serializers.IntegerField()


class LoyaltyCardOut(serializers.Serializer):
    stamps = serializers.IntegerField()
    stampsPerReward = serializers.IntegerField()
    memberNumber = serializers.CharField()
    eligibility = serializers.CharField()
    rewardDescription = serializers.CharField()
    walletPassAdded = serializers.BooleanField()
    walletPassAvailable = serializers.BooleanField(
        required=False,
        help_text="The server can issue an Apple Wallet pass: show the Wallet button.",
    )


class LoyaltyActivityOut(serializers.Serializer):
    id = serializers.CharField()
    type = serializers.ChoiceField(choices=["earn", "redeem"])
    description = serializers.CharField()
    locationName = serializers.CharField()
    occurredAt = serializers.DateTimeField()


class LoyaltyPageOut(serializers.Serializer):
    items = LoyaltyActivityOut(many=True)
    nextCursor = serializers.CharField(allow_null=True)


class WalletPassOut(serializers.Serializer):
    url = serializers.CharField()


class ReservationOut(serializers.Serializer):
    id = serializers.CharField()
    locationId = serializers.CharField()
    date = serializers.DateField()
    time = serializers.CharField(help_text="HH:MM")
    guests = serializers.IntegerField()
    seating = serializers.ChoiceField(choices=["indoor", "outdoor"])
    status = serializers.ChoiceField(choices=["requested", "confirmed", "cancelled"])
    createdAt = serializers.DateTimeField()


class CateringPackageOut(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    pricePerPersonCents = serializers.IntegerField()
    priceLabel = serializers.CharField()
    unit = serializers.CharField()
    imageUrl = serializers.CharField(allow_null=True)
    imagePosition = serializers.CharField()
    blurb = serializers.CharField()
    inclusions = serializers.ListField(child=serializers.CharField())


class CateringEnquiryOut(serializers.Serializer):
    id = serializers.CharField()
    packageId = serializers.CharField()
    packageName = serializers.CharField()
    guests = serializers.IntegerField(allow_null=True)
    date = serializers.DateField(allow_null=True)
    occasion = serializers.CharField()
    status = serializers.ChoiceField(choices=["enquiry_sent", "quoted", "confirmed", "closed"])
    createdAt = serializers.DateTimeField()


class GiftCardOut(serializers.Serializer):
    last4 = serializers.CharField()
    balanceCents = serializers.IntegerField()


class GiftActivityOut(serializers.Serializer):
    id = serializers.CharField()
    kind = serializers.ChoiceField(choices=["added", "spent", "sent"])
    description = serializers.CharField()
    amountCents = serializers.IntegerField(help_text="Always positive; kind gives the direction.")
    occurredAt = serializers.DateTimeField()


class NotificationOut(serializers.Serializer):
    id = serializers.CharField()
    kind = serializers.ChoiceField(choices=["order", "loyalty", "booking", "offer", "gift_card"])
    text = serializers.CharField()
    createdAt = serializers.DateTimeField()
    unread = serializers.BooleanField()
    url = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="App screen a tap opens (e.g. /orders/<id>); empty: pick one by kind.",
    )


class NotificationFeedOut(serializers.Serializer):
    items = NotificationOut(many=True)
    unseenIds = serializers.ListField(child=serializers.CharField())


class OfferOut(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    tag = serializers.CharField()
    line = serializers.CharField()
    fine = serializers.CharField()
    imageUrl = serializers.CharField(allow_null=True)


class FaqOut(serializers.Serializer):
    question = serializers.CharField()
    answer = serializers.CharField()


class PushTokenIn(serializers.Serializer):
    token = serializers.RegexField(
        r"^Expo(nent)?PushToken\[[^\]]+\]$",
        max_length=200,
        help_text="From expo-notifications getExpoPushTokenAsync(), e.g. ExponentPushToken[xxxx].",
    )
    platform = serializers.ChoiceField(choices=["ios", "android"], required=False)
