"""Request/response examples shown on the app API docs page (/api/docs/app/)."""

from drf_spectacular.utils import OpenApiExample


def request(name, value):
    return OpenApiExample(name, value=value, request_only=True)


def response(name, value, status="200"):
    return OpenApiExample(name, value=value, response_only=True, status_codes=[status])


def error(name, code, message, status, fields=None):
    return response(
        name, {"error": {"code": code, "message": message, "fields": fields or {}}}, status
    )


SESSION = {
    "customerId": "6f0c2c3e-5f8b-4a3e-9d55-1d2b7f0a9e10",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIn0.signature",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCJ9.signature",
    "expiresAt": "2026-10-12T08:27:40+11:00",
}

SIGN_IN = [
    request("Sign in", {"email": "sophie@example.com", "password": "my-long-password"}),
    response("Session", SESSION),
    error(
        "Wrong password",
        "UNAUTHORIZED",
        "That email and password don’t match. Try again or reset your password.",
        "401",
    ),
]

SIGN_UP = [
    request(
        "New customer",
        {
            "name": "Sophie Nguyen",
            "phone": "0400 123 456",
            "email": "sophie@example.com",
            "password": "my-long-password",
        },
    ),
    response("Session", SESSION, "201"),
    error(
        "Email taken",
        "CONFLICT",
        "An account with this email already exists. Log in instead.",
        "409",
        {"email": "taken"},
    ),
    error(
        "Invalid email",
        "VALIDATION",
        "Enter a valid email address.",
        "422",
        {"email": "invalid"},
    ),
]

LOCATION = {
    "id": "braddon",
    "name": "Braddon",
    "subtitle": "Lonsdale St",
    "area": "Lonsdale St",
    "headline": "Wholesome food, great coffee on Lonsdale St.",
    "address": "1/18 Lonsdale St, Braddon ACT 2612",
    "phone": "0451 448 018",
    "email": "braddon@eightytwentyfood.com.au",
    "hoursLabel": "Mon–Sun 6:00am – 3:00pm",
    "hoursShort": "6am – 3pm, 7 days",
    "weeklyHours": {
        day: {"open": "06:00", "close": "15:00"}
        for day in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
    },
    "status": "open",
    "fulfilmentMethods": ["pickup", "delivery", "dine_in"],
    "note": "Located right at the Rainbow Roundabout",
    "waitLabel": "20–25 min",
    "imageUrl": "https://example.supabase.co/storage/v1/object/public/media/website/0b5c/800.webp",
    "galleryUrls": [
        "https://example.supabase.co/storage/v1/object/public/media/website/7d1e/800.webp"
    ],
    "externalOrderUrl": "https://eightytwentybraddon.lifeintouch.net/",
    "bookingLabel": "Braddon - Lonsdale St",
    "flags": {"flagship": True, "limitedMenu": False, "glutenFree": False},
}
COMING_SOON = {
    **LOCATION,
    "id": "akuna",
    "name": "Akuna St",
    "subtitle": "Heart of City",
    "area": "Heart of City",
    "headline": "Coming soon to the heart of the city.",
    "address": "Akuna St, Canberra City",
    "phone": None,
    "email": None,
    "hoursLabel": "Hours to be confirmed",
    "hoursShort": "Hours TBC",
    "weeklyHours": None,
    "status": "coming_soon",
    "fulfilmentMethods": ["pickup"],
    "note": "Listed venue, full details to be confirmed",
    "waitLabel": None,
    "galleryUrls": [],
    "externalOrderUrl": None,
    "bookingLabel": "Akuna St - Heart of City",
    "flags": {"flagship": False, "limitedMenu": False, "glutenFree": False},
}
LOCATIONS = [response("Cafés", [LOCATION, COMING_SOON])]

MENU_ITEM = {
    "id": "hotcoffee",
    "categoryId": "coffee",
    "name": "Milk Based Coffee",
    "description": "",
    "priceCents": 500,
    "dietary": [],
    "imageUrl": "https://example.supabase.co/storage/v1/object/public/media/website/91aa/800.webp",
    "featured": True,
    "modifierGroups": [
        {
            "id": "drink",
            "name": "Choose your drink",
            "required": True,
            "maxSelections": 1,
            "options": [
                {"name": "Flat White", "priceCents": 50},
                {"name": "Latte", "priceCents": 50},
                {"name": "Macchiato", "priceCents": 0},
            ],
        },
        {
            "id": "var",
            "name": "Drink variation",
            "required": False,
            "maxSelections": 0,
            "options": [
                {"name": "Large", "priceCents": 100},
                {"name": "OAT ADC", "priceCents": 80},
            ],
        },
    ],
}
MENU = [response("Menu", [MENU_ITEM])]

LINES = [
    {
        "itemId": "hotcoffee",
        "qty": 1,
        "selections": {"drink": ["Flat White"], "var": ["OAT ADC"]},
        "note": "",
    },
    {
        "itemId": "bburger",
        "qty": 1,
        "selections": {"style": ["Original"]},
        "note": "No beetroot relish",
    },
]
ORDER_BODY = {
    "locationId": "braddon",
    "method": "pickup",
    "timing": {"type": "asap"},
    "deliveryAddress": None,
    "tableNumber": None,
    "lines": LINES,
    "payment": {"choice": "new_card", "token": "<single-use provider token>"},
    "useGiftCard": True,
    "useReward": False,
    "contact": {"name": "Sophie Nguyen", "phone": "0400 123 456"},
    "expectedTotalCents": 2016,
}
TOTALS = {
    "subtotalCents": 2930,
    "deliveryCents": 0,
    "rewardCents": 0,
    "surchargeCents": 86,
    "giftCardCents": 1000,
    "totalCents": 2016,
}
ORDER = {
    "id": "4458a402-6f66-47eb-893a-63faa08137eb",
    "number": "#8020-1197",
    "locationId": "braddon",
    "locationName": "Braddon",
    "method": "pickup",
    "status": "received",
    "createdAt": "2026-10-12T08:12:40+11:00",
    "timing": {"type": "asap"},
    "deliveryAddress": None,
    "tableNumber": None,
    "lines": [
        {
            "itemId": "hotcoffee",
            "name": "Milk Based Coffee",
            "qty": 1,
            "unitPriceCents": 630,
            "selections": {"drink": ["Flat White"], "var": ["OAT ADC"]},
            "modifiersLabel": "Flat White, OAT ADC",
            "note": "",
        },
        {
            "itemId": "bburger",
            "name": "Breakfast Burger",
            "qty": 1,
            "unitPriceCents": 2300,
            "selections": {"style": ["Original"]},
            "modifiersLabel": "Original",
            "note": "No beetroot relish",
        },
    ],
    "totals": TOTALS,
    "paymentLabel": "Card + gift card",
    "stampsEarned": 1,
    "rewardRedeemed": False,
    "estimatedWait": "20–25 min",
}
CREATE_ORDER = [
    request("Pickup, card + gift card", ORDER_BODY),
    request(
        "Delivery, Apple Pay, free coffee",
        {
            **ORDER_BODY,
            "method": "delivery",
            "deliveryAddress": "12 Smith St, Braddon ACT 2612",
            "payment": {"choice": "apple_pay", "token": "<Apple Pay token>"},
            "useGiftCard": False,
            "useReward": True,
            "expectedTotalCents": 2593,
        },
    ),
    response("Order received", ORDER, "201"),
    error(
        "Price changed",
        "PRICE_CHANGED",
        "Your total changed to $20.16. Please review your order.",
        "409",
    ),
    error(
        "No payment provider yet",
        "NOT_IMPLEMENTED",
        "Card and Apple Pay payments aren’t available in the app yet. Please order at the café.",
        "501",
    ),
    error("Missing token", "PAYMENT_DECLINED", "Payment was not completed.", "402"),
    error(
        "Coming-soon café",
        "LOCATION_UNAVAILABLE",
        "This café isn’t taking orders yet.",
        "422",
    ),
]
QUOTE = [
    request(
        "Cart",
        {
            "locationId": "braddon",
            "method": "pickup",
            "lines": LINES,
            "payment": {"choice": "new_card"},
            "useGiftCard": True,
            "useReward": False,
        },
    ),
    response(
        "Server totals",
        {
            "lines": [
                {
                    "itemId": line["itemId"],
                    "name": name,
                    "qty": 1,
                    "unitPriceCents": price,
                    "modifiersLabel": label,
                }
                for line, name, price, label in zip(
                    LINES,
                    ["Milk Based Coffee", "Breakfast Burger"],
                    [630, 2300],
                    ["Flat White, OAT ADC", "Original"],
                    strict=True,
                )
            ],
            "totals": TOTALS,
            "rewardAvailable": False,
            "coffeeCount": 1,
            "itemCount": 2,
        },
    ),
]
ORDER_DETAIL = [response("Order", {**ORDER, "status": "ready"})]

LOYALTY = [
    response(
        "Coffee card",
        {
            "stamps": 6,
            "stampsPerReward": 9,
            "memberNumber": "8020 0624 1188",
            "eligibility": "Any coffee or hot drink, any size, at any EightyTwenty café.",
            "rewardDescription": "Your 10th coffee is free.",
            "walletPassAdded": False,
        },
    )
]

RESERVATION = [
    request(
        "Table request",
        {
            "locationId": "braddon",
            "date": "2026-10-15",
            "time": "09:30",
            "guests": 2,
            "seating": "outdoor",
            "name": "Sophie Nguyen",
            "phone": "0400 123 456",
            "email": "sophie@example.com",
            "notes": "High chair please",
        },
    ),
    response(
        "Requested",
        {
            "id": "1c9e4f22-0e1f-4b8e-a0c5-0d3b8c1f7a11",
            "locationId": "braddon",
            "date": "2026-10-15",
            "time": "09:30",
            "guests": 2,
            "seating": "outdoor",
            "status": "requested",
            "createdAt": "2026-10-12T08:20:00+11:00",
        },
        "201",
    ),
    error(
        "Date too soon",
        "VALIDATION",
        "Choose a date from tomorrow onwards.",
        "422",
        {"date": "invalid"},
    ),
    error(
        "Outside hours",
        "VALIDATION",
        "Café is closed at this time",
        "422",
        {"time": "invalid"},
    ),
]

ENQUIRY = [
    request(
        "Catering enquiry",
        {
            "packageId": "lunch",
            "firstName": "Sophie",
            "lastName": "Nguyen",
            "email": "sophie@example.com",
            "phone": "0400 123 456",
            "company": "",
            "occasion": "Team lunch",
            "date": "2026-11-02",
            "time": "12:00",
            "guests": 30,
            "location": "Level 3, 10 Moore St, Canberra",
            "dietary": ["Vegan", "Gluten free"],
            "notes": "Two coeliac guests.",
        },
    ),
    response(
        "Enquiry sent",
        {
            "id": "a6f7c2d1-4b3e-4c55-9f0a-2e8d7b6c5a44",
            "packageId": "lunch",
            "packageName": "Lunch",
            "guests": 30,
            "date": "2026-11-02",
            "occasion": "Team lunch",
            "status": "enquiry_sent",
            "createdAt": "2026-10-12T08:25:00+11:00",
        },
        "201",
    ),
]

GIFT_SEND = [
    request(
        "eGift",
        {
            "amountCents": 5000,
            "recipientName": "Alex",
            "recipientEmail": "alex@example.com",
            "message": "Happy birthday!",
            "paymentToken": "<Apple Pay token>",
        },
    ),
    response(
        "Sent",
        {
            "id": "5d2e8f10-9a7b-4c6d-8e5f-4a3b2c1d0e9f",
            "kind": "sent",
            "description": "Sent to Alex",
            "amountCents": 5000,
            "occurredAt": "2026-10-12T08:30:00+11:00",
        },
        "201",
    ),
    error(
        "No payment provider yet",
        "NOT_IMPLEMENTED",
        "Card and Apple Pay payments aren’t available in the app yet. Please order at the café.",
        "501",
    ),
]

FEED = [
    response(
        "Feed",
        {
            "items": [
                {
                    "id": "0f1e2d3c-4b5a-4968-8776-655443322110",
                    "kind": "order",
                    "text": "Order #8020-1197 is ready at the Braddon counter.",
                    "createdAt": "2026-10-12T08:14:00+11:00",
                    "unread": True,
                }
            ],
            "unseenIds": ["0f1e2d3c-4b5a-4968-8776-655443322110"],
        },
    )
]
