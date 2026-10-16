"""Request/response examples shown on the till API docs page (/api/docs/pos/)."""

from drf_spectacular.utils import OpenApiExample


def request(name, value):
    return OpenApiExample(name, value=value, request_only=True)


def response(name, value, status="200"):
    return OpenApiExample(name, value=value, response_only=True, status_codes=[status])


def error(name, code, message, status, fields=None):
    return response(
        name, {"error": {"code": code, "message": message, "fields": fields or {}}}, status
    )


STAFF = {
    "id": "0b6f3c1e-2d7a-4f55-9a61-7c1f0f4d2e11",
    "name": "Mia Tran",
    "initials": "MT",
    "role": "cashier",
    "cafe": "braddon",
    "shift": "",
}

VERIFY_PIN = [
    request("PIN", {"pin": "4821"}),
    response(
        "Recognised",
        {
            "staff": STAFF,
            "permissions": [
                "pos",
                "orders",
                "reservations.view",
                "customers.view",
                "loyalty.stamp",
                "gift.redeem",
                "kitchen",
            ],
        },
    ),
]

LINES = [
    {
        "key": "L7K2Q9XMA",
        "itemId": "hotcoffee",
        "name": "Milk Based Coffee",
        "price": 6.3,
        "qty": 2,
        "sel": {"drink": ["Flat White"], "var": ["OAT ADC"]},
        "adjust": ["Extra hot"],
        "note": "",
    },
    {
        "key": "LQ2M7ZP0C",
        "itemId": "mighty",
        "name": "Mighty Breakfast",
        "price": 35,
        "qty": 1,
        "sel": {},
        "adjust": [],
        "note": "Eggs poached",
    },
]

ORDER = {
    "id": "BRADDON-TILL-1-0042",
    "channel": "pos",
    "type": "dinein",
    "status": "new",
    "accepted": True,
    "cafe": "braddon",
    "time": "09:41",
    "placedAt": "2026-10-16T09:41:12+11:00",
    "table": "T4",
    "tables": ["T4"],
    "lines": LINES,
    "total": 47.6,
    "paid": False,
    "methods": [],
    "payments": [],
    "note": "",
    "discounts": [],
    "rewardUsed": False,
    "staff": "Mia Tran",
    "history": [{"at": "16 Oct, 9:41 am", "what": "Created on till by Mia Tran"}],
}

ORDER_OUT = {
    **ORDER,
    "refunds": [],
    "stamped": False,
    "cleared": False,
}

CREATE_ORDER = [
    request("Dine-in order", ORDER),
    response("Recorded", ORDER_OUT, "201"),
    error(
        "Number already used",
        "CONFLICT",
        "Order BRADDON-TILL-1-0042 already exists. Each till must number its orders uniquely.",
        "409",
    ),
    error(
        "Total does not add up",
        "VALIDATION",
        "The order total $40.00 does not add up: lines $47.60 − discounts $0.00 + delivery "
        "$0.00 = $47.60.",
        "422",
        {"total": "invalid"},
    ),
]

PAYMENT = [
    request(
        "Card on the terminal",
        {
            "method": "card",
            "amount": 4760,
            "tip": 0,
            "surcharge": 140,
            "ref": "P8XK2M4QA",
            "giftLast4": None,
            "at": "16 Oct, 10:02 am",
            "by": "Mia Tran",
            "mode": "full",
        },
    ),
    request(
        "Cash with change",
        {
            "method": "cash",
            "amount": 4760,
            "tip": 0,
            "surcharge": 0,
            "ref": "P3MZQ8W1D",
            "at": "16 Oct, 10:02 am",
            "by": "Mia Tran",
            "cashPaid": 5000,
            "rounding": 0,
            "change": 240,
        },
    ),
    error(
        "More than is due",
        "VALIDATION",
        "$50.00 is more than the $47.60 due on BRADDON-TILL-1-0042.",
        "422",
        {"amount": "invalid"},
    ),
]

PREPARATION = [
    request(
        "Drinks ready, food cooking",
        {
            "lines": [
                {"key": "L7K2Q9XMA", "prep": "ready"},
                {"key": "LQ2M7ZP0C", "prep": "preparing"},
            ],
            "status": "preparing",
            "note": "Drinks ready · Leo",
        },
    ),
    error(
        "No longer live",
        "CONFLICT",
        "Order BRADDON-TILL-1-0042 is completed; no change made.",
        "409",
    ),
]

ADJUSTMENT = [
    request(
        "Refund one coffee",
        {
            "adjustment": {
                "key": "R5TQ1ZK8M",
                "mode": "refund",
                "amount": 630,
                "alloc": [{"method": "card", "amount": 630, "ref": "P8XK2M4QA", "giftLast4": None}],
                "reason": "Wrong item made",
                "by": "Mia Tran",
                "approver": "Sam Lee",
                "at": "16 Oct, 10:15 am",
                "items": {"L7K2Q9XMA": 1},
            },
            "lines": [{"key": "L7K2Q9XMA", "qty": 2}, {"key": "LQ2M7ZP0C", "qty": 1}],
            "total": 47.6,
            "status": "completed",
        },
    ),
]

CLOSE_SHIFT = [
    request(
        "Close with a small variance",
        {
            "id": "SH4K9M2QZ",
            "cafe": "braddon",
            "staffId": STAFF["id"],
            "staffName": "Mia Tran",
            "openedAt": "16 Oct, 6:02 am",
            "float": 20000,
            "cashSales": 48650,
            "cashRefunds": 630,
            "moves": [
                {
                    "id": "M2Q8ZK1PA",
                    "type": "out",
                    "amount": 4500,
                    "reason": "Supplier paid in cash",
                    "by": "Mia Tran",
                    "approver": "Sam Lee",
                    "at": "16 Oct, 11:20 am",
                }
            ],
            "status": "closed",
            "closedAt": "16 Oct, 3:08 pm",
            "closedBy": "Mia Tran",
            "counted": 63500,
            "expected": 63520,
            "variance": -20,
            "note": "",
            "approvedBy": "",
        },
    ),
]

SNAPSHOT = [
    response(
        "Braddon (abridged)",
        {
            "locations": [
                {
                    "id": "braddon",
                    "name": "Braddon",
                    "address": "1/18 Lonsdale St, Braddon ACT 2612",
                    "phone": "0451 448 018",
                    "hours": "Mon–Sun 6:00am – 3:00pm",
                    "hoursShort": "6am – 3pm, 7 days",
                    "email": "braddon@eightytwentyfood.com.au",
                }
            ],
            "categories": [{"id": "coffee", "name": "Coffee & Hot Drinks", "note": ""}],
            "menu": [
                {
                    "id": "mighty",
                    "cat": "allday",
                    "name": "Mighty Breakfast",
                    "price": 35,
                    "diet": ["GF*", "DF*"],
                    "img": "img/menu-original/food/mighty-breakfast-01.webp",
                    "desc": "Sourdough, Smoked Bacon, Free Range Eggs…",
                    "mods": [
                        {
                            "id": "add",
                            "name": "Add ons",
                            "required": False,
                            "max": 0,
                            "options": [["Avocado", 4]],
                        }
                    ],
                    "featured": True,
                }
            ],
            "cateringPackages": [],
            "tables": [],
            "promotions": [],
            "availability": {
                "soldOut": [],
                "branchOff": {"braddon": ["matcha-heaven"]},
                "unavailableMods": [],
                "prices": {},
                "lastPushedAt": "2026-10-16T06:00:00+11:00",
            },
            "stock": [],
            "stockLog": [],
            "orders": [ORDER_OUT],
            "customers": [],
            "giftCards": [],
            "reservations": [],
            "catering": [],
            "staff": [STAFF],
            "roles": {"admin": {"label": "Admin", "perms": ["*"]}},
            "settings": {
                "loyalty": {"per": 9, "wallet": True, "online": True},
                "loyaltyCopy": {
                    "reward": "Your 10th coffee is free.",
                    "eligible": "Any coffee or hot drink, any size, at any EightyTwenty café.",
                },
                "rules": {"gst": "10", "surcharge": "2.95", "delivery": "10"},
                "toggles": {
                    "kitchen": True,
                    "receipt": False,
                    "tips": False,
                    "openDrawer": True,
                    "autoStamp": True,
                },
                "cafeFields": {},
                "categoryOrder": [],
            },
            "currentShift": None,
            "closedShifts": [],
            "audit": [],
            "reports": {"days": [{"d": "Thu", "sales": 1240.5, "orders": 96, "partial": True}]},
        },
    )
]
