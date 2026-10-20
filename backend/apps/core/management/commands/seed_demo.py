"""
Demo data for a LOCAL database: a working café chain with weeks of history in every table, so
the workspace can be shown to the client. Refuses any database that is not SQLite or localhost.
"""

import random
import string
from collections import defaultdict
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from apps.accounts.models import CustomerProfile, SavedAddress, StaffAssignment, User
from apps.bookings.models import Booking, BookingRule
from apps.cms.models import ContentBlock, Faq, NavigationItem, Offer, Page
from apps.core.models import AuditLog
from apps.enquiries.models import CateringPackage, Enquiry
from apps.locations.models import Location, SpecialHours
from apps.loyalty.models import (
    STAMPS_PER_REWARD,
    GiftCard,
    GiftCardActivity,
    LoyaltyActivity,
    LoyaltyCard,
)
from apps.loyalty.services import is_coffee
from apps.menu.models import LocationMenuItem, MenuItem
from apps.notifications.models import AppNotification, EmailMessage, PushDevice
from apps.orders.models import Order, OrderAdjustment, OrderLine, OrderPayment
from apps.pos import pins
from apps.pos.models import CashShift, Promotion, TillTable, TillTransaction

OWNER_EMAIL = "owner@example.com"
FIRST = (
    "Olivia Jack Charlotte Noah Amelia Leo Isla Henry Mia Lucas Ava Oscar Grace Theo Ruby Archie "
    "Chloe Hugo Zoe Max Ella Finn Lily Ethan Sophie Liam Harper Jasper Willow Kai Matilda Oliver "
    "Evie William Sienna Thomas Ivy James Hannah Charlie Georgia Lachlan Zara Cooper Mila Harrison "
    "Audrey Riley Layla Hamish Phoebe Xavier Aria Nate Emily Ryan Jasmine Sam Priya Arjun Mei Daniel "
    "Linh Minh Hana Yuki Aisha Omar Sofia Mateo Freya Angus Imogen Patrick Tahlia Darcy Bianca"
).split()
LAST = (
    "Smith Brown Wilson Taylor Jones Martin White Clarke Nguyen Chen Walker Hall Young King Wright "
    "Scott Green Baker Adams Hill Lee Tran Kelly Murphy Ross Price Ward Cook Bell Reid Campbell "
    "Anderson Thompson Mitchell Robinson Harris Lewis Ryan Johnson Williams Patel Singh Wang Zhang "
    "Pham Le Kim Park Rossi Russo Papadopoulos Nikolaidis O'Brien Sullivan McDonald Fraser Stewart "
    "Hughes Edwards Turner Phillips Morgan Cooper Hayes Fitzgerald Dunn Carter Gray Hunt Watson"
).split()
DOMAINS = ["example.com", "example.net", "example.org"]
SUBURBS = [
    ("Braddon", "2612"), ("Turner", "2612"), ("Reid", "2612"), ("Kingston", "2604"),
    ("Griffith", "2603"), ("Dickson", "2602"), ("Ainslie", "2602"), ("Belconnen", "2617"),
    ("Bruce", "2617"), ("Gungahlin", "2912"), ("Franklin", "2913"), ("Phillip", "2606"),
    ("Woden", "2606"), ("Kambah", "2902"), ("Coombs", "2611"), ("Wright", "2611"),
    ("Forrest", "2603"), ("Lyneham", "2602"), ("O'Connor", "2602"), ("Campbell", "2612"),
]  # fmt: skip
STREETS = [
    "Lonsdale St", "Northbourne Ave", "Limestone Ave", "Antill St", "Canberra Ave", "Bunda St",
    "Mort St", "Hibberson St", "Anketell St", "Cowlishaw St", "Kennedy St", "Eyre St",
    "Challis St", "Emu Bank", "Swanson Ct", "Badham St", "Torrens St", "Macarthur Ave",
]  # fmt: skip
BOOKING_NOTES = [
    "", "", "", "", "Window seat if possible", "Birthday breakfast — we'll bring a candle",
    "High chair needed", "One guest is coeliac", "Running about 10 minutes late",
    "Outdoor table please, we have a dog", "Pram friendly table if possible",
    "Celebrating an anniversary", "Work meeting, quiet table would be great", "Vegan guest",
]  # fmt: skip
ORDER_NOTES = ["", "", "", "", "", "", "Extra hot please", "No onion", "Sauce on the side",
               "Gluten free bread", "Light ice", "Allergic to nuts", "Cut in half please"]  # fmt: skip
COMPANIES = [
    "Canberra Health Services", "ANU School of Music", "Deloitte Canberra", "Lendlease ACT",
    "KPMG Canberra", "Raiz Fitness Braddon", "CIT Reid", "Gungahlin Physio", "ACT Netball",
    "Little Oak Childcare", "Hotel Realm", "Kingston Foreshore Body Corporate",
    "Belconnen Arts Centre", "The Grounds Yoga", "UC Sports Club",
]  # fmt: skip
GROCERS = ["Kingston Grocer", "Ainslie Pantry", "Two Before Ten", "Dickson Fresh",
           "Wright Wholefoods", "Belco Organics"]  # fmt: skip
CATERING_MESSAGES = [
    "Hi team, we'd love catering for our office lunch. Mostly vegetarian, two gluten free. "
    "Could you send a quote with delivery?",
    "Looking for a morning tea platter for a baby shower on a Saturday. Do you deliver to {suburb}?",
    "We're running a two-day workshop and need breakfast and lunch for both days. Is that "
    "something you can do?",
    "Could we get a quote for acai bowls and smoothies for a team wellness morning?",
    "End of year party for our team — sweets board and sandwiches. Can you do pickup at 11am?",
    "Board meeting next month, after something light and healthy for lunch. Any recommendations?",
]
WHOLESALE_MESSAGES = [
    "We run a small grocer in {suburb} and would love to stock your granola and protein balls. "
    "What are your wholesale prices and minimum order?",
    "Interested in supplying your cold brew to our gym café. Do you do kegs or bottles?",
    "Could we stock your banana bread? We'd need about 3 loaves a day, Monday to Friday.",
]
CONTACT_MESSAGES = [
    "I left a black umbrella at the {cafe} café on Saturday morning — has anyone found it?",
    "Just wanted to say the team at {cafe} were amazing this morning. Thank you!",
    "Do you have any part-time barista positions available?",
    "Is the {cafe} café dog friendly outside?",
    "My coffee card stamps didn't show after Tuesday's order, can you check?",
    "Do you take bookings for groups of 12 on weekends?",
]
REFUND_REASONS = ["Wrong order", "Cold coffee", "Customer changed mind", "Item unavailable",
                  "Charged twice"]  # fmt: skip
PEAK_HOURS = [(6, 3), (7, 10), (8, 14), (9, 12), (10, 9), (11, 8), (12, 11), (13, 8), (14, 4)]


@contextmanager
def own_timestamps(*models):
    """Let the seed set created_at/updated_at itself (history spread over past days)."""
    saved = []
    for model in models:
        for name in ("created_at", "updated_at"):
            field = model._meta.get_field(name)
            saved.append((field, field.auto_now, field.auto_now_add))
            field.auto_now = field.auto_now_add = False
    try:
        yield
    finally:
        for field, auto_now, auto_now_add in saved:
            field.auto_now, field.auto_now_add = auto_now, auto_now_add


TIMED = (
    User, CustomerProfile, SavedAddress, StaffAssignment, Order, OrderLine, OrderPayment,
    OrderAdjustment, TillTransaction, Booking, Enquiry, AuditLog, EmailMessage, AppNotification,
    PushDevice, LoyaltyCard, LoyaltyActivity, GiftCard, GiftCardActivity, CashShift,
)  # fmt: skip


class Command(BaseCommand):
    help = (
        "Fill a LOCAL database with a working café chain: team, customers, weeks of orders, "
        "bookings, enquiries, till shifts and every other table. Refuses any other database."
    )

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=60, help="Days of history.")
        parser.add_argument("--customers", type=int, default=400)
        parser.add_argument(
            "--password", default="eightytwenty-demo", help="Password for every demo account."
        )

    def handle(self, *args, **options):
        host = connection.settings_dict.get("HOST") or ""
        if connection.vendor != "sqlite" and host not in ("localhost", "127.0.0.1"):
            raise CommandError("Demo data only goes into a local database (SQLite or localhost).")
        if not Location.objects.filter(is_published=True).exists():
            raise CommandError(
                "No cafés yet. Load the menu first: export mock-data.js and run seed_from_mock."
            )
        if User.objects.filter(email=OWNER_EMAIL).exists():
            raise CommandError(
                "Demo data is already here. Start from an empty database to redo it."
            )
        self.rng = random.Random(8020)
        self.hash = make_password(options["password"])
        self.now = timezone.now()
        self.today = timezone.localdate()
        self.days = max(1, options["days"])
        self.cafes = list(
            Location.objects.filter(is_published=True, status="open").order_by("sort_order")
        ) or list(Location.objects.filter(is_published=True))
        self.codes = {}  # short till prefix per café: BRA, CIV… (unique)
        for cafe in self.cafes:
            base = code = cafe.slug[:3].upper()
            while code in self.codes.values():
                code = f"{base}{len(self.codes)}"
            self.codes[cafe.pk] = code
        self.items = list(
            MenuItem.objects.filter(is_published=True, base_price_cents__gt=0, location=None)
            .select_related("category")
            .prefetch_related("modifier_links__modifier_group__options")
        )
        if not self.items:
            raise CommandError("No published menu items with a price.")
        self.weights = [self.item_weight(item) for item in self.items]
        self.cash = defaultdict(int)  # (café id, day) -> cash taken at the tills
        self.audit_rows, self.notes, self.emails = [], [], []
        with transaction.atomic(), own_timestamps(*TIMED):
            self.team()
            self.customers(options["customers"])
            self.cafe_setup()
            self.website_content()
            orders = self.orders()
            bookings = self.bookings()
            enquiries = self.enquiries()
            self.shifts()
            self.flush()
        self.stdout.write(
            self.style.SUCCESS(
                f"Demo data: {len(self.staff) + 1} team, {len(self.people)} customers, "
                f"{orders} orders, {bookings} bookings, {enquiries} enquiries, "
                f"{AuditLog.objects.count()} activity entries."
            )
        )
        self.stdout.write(
            f"Sign in at /login/ as {OWNER_EMAIL} (chain owner), manager.<cafe-slug>@example.com "
            f"or staff.<cafe-slug>@example.com, with the --password value. Till PINs: 1001, ..."
        )

    # --- helpers --------------------------------------------------------------------------
    def at(self, day, hour, minute=0):
        return timezone.make_aware(datetime.combine(day, time(hour, minute)))

    def ago(self, days, hours=0):
        return self.now - timedelta(days=days, hours=hours)

    def stamp(self, obj, when):
        obj.created_at = obj.updated_at = when
        return obj

    def phone(self):
        return f"04{self.rng.randint(10, 99)} {self.rng.randint(100, 999)} {self.rng.randint(100, 999)}"

    def address(self):
        suburb, postcode = self.rng.choice(SUBURBS)
        return f"{self.rng.randint(1, 120)} {self.rng.choice(STREETS)}, {suburb} ACT {postcode}"

    def item_weight(self, item):
        if is_coffee(item.category.slug, item.name):
            return 7
        return 3 if item.category.slug in ("cold", "smoothies", "juices") else 2

    def audit(self, actor, entity, before, after, when, action="update"):
        self.audit_rows.append(
            self.stamp(
                AuditLog(
                    actor=actor,
                    action=action,
                    entity_type=entity._meta.label_lower,
                    entity_id=str(entity.pk),
                    before=before,
                    after=after,
                ),
                when,
            )
        )

    def flush(self):
        AuditLog.objects.bulk_create(self.audit_rows, batch_size=1000)
        AppNotification.objects.bulk_create(self.notes, batch_size=1000)
        EmailMessage.objects.bulk_create(self.emails, batch_size=1000)

    def email(self, to, subject, body, when, status="sent", error=""):
        self.emails.append(
            self.stamp(
                EmailMessage(
                    recipient=to, subject=subject, body=body,
                    dedup_key=f"demo-{len(self.emails)}-{to}", status=status,
                    attempts=3 if status == "failed" else 1, next_attempt_at=when,
                    sent_at=when if status == "sent" else None, last_error=error,
                ),
                when,
            )
        )  # fmt: skip

    # --- people ---------------------------------------------------------------------------
    def team(self):
        joined = self.ago(400)
        self.owner = self.stamp(
            User(
                email=OWNER_EMAIL, first_name="Sam", last_name="Nguyen", role="owner",
                is_staff=True, is_superuser=True, password=self.hash, date_joined=joined,
                phone="0412 802 080",
            ),
            joined,
        )  # fmt: skip
        users, links, self.staff, self.crew = [self.owner], [], [], defaultdict(list)
        pin, names = 1001, self.unique_names(len(self.cafes) * 4)
        for cafe in self.cafes:
            for role, prefix in [("manager", "manager"), ("staff", "staff"), ("staff", "staff2"),
                                 ("staff", "staff3")]:  # fmt: skip
                first, last = next(names)
                when = self.ago(self.rng.randint(30, 380))
                user = self.stamp(
                    User(
                        email=f"{prefix}.{cafe.slug}@example.com", first_name=first,
                        last_name=last, role=role, is_staff=True, password=self.hash,
                        date_joined=when, phone=self.phone(), last_login=self.ago(0, 2),
                    ),
                    when,
                )  # fmt: skip
                user.pos_pin = pins.pin_hash(user, str(pin))
                pin += 1
                users.append(user)
                self.staff.append(user)
                self.crew[cafe.pk].append(user)
                links.append(self.stamp(StaffAssignment(user=user, location=cafe), when))
        User.objects.bulk_create(users)
        StaffAssignment.objects.bulk_create(links)
        self.managers = {cafe.pk: self.crew[cafe.pk][0] for cafe in self.cafes}

    def unique_names(self, count):
        pairs = [(f, la) for f in FIRST for la in LAST]
        self.rng.shuffle(pairs)
        return iter(pairs[:count])

    def customers(self, count):
        names = self.unique_names(count + len(self.cafes) * 4)
        for _ in range(len(self.cafes) * 4):  # names the team already uses
            next(names)
        users, profiles, cards, gifts, extras = [], [], [], [], []
        for index in range(count):
            first, last = next(names)
            when = self.ago(self.rng.randint(5, 365))
            local = f"{first}.{last}".lower().replace("'", "")
            if index % 3 == 0:
                local += str(self.rng.randint(1, 99))
            user = self.stamp(
                User(
                    email=f"{local}@{DOMAINS[index % 3]}", first_name=first, last_name=last,
                    role="customer", password=self.hash, date_joined=when, phone=self.phone(),
                    email_verified=self.rng.random() < 0.8,
                    marketing_opt_in=self.rng.random() < 0.55,
                    last_login=self.ago(self.rng.randint(0, 30)),
                ),
                when,
            )  # fmt: skip
            users.append(user)
            profiles.append(
                self.stamp(
                    CustomerProfile(
                        user=user,
                        preferred_location=self.rng.choice(self.cafes),
                        birthday=date(1965, 1, 1) + timedelta(days=self.rng.randint(0, 15000))
                        if self.rng.random() < 0.4
                        else None,
                        notes=self.rng.choice(["", "", "", "", "Oat milk, extra hot",
                                               "Regular — always a long black", "Coeliac"]),
                        favourite_items=[i.slug for i in self.rng.sample(self.items, min(3, len(self.items)))],
                    ),
                    when,
                )
            )  # fmt: skip
            cards.append(self.stamp(LoyaltyCard(user=user, stamps=self.rng.randint(0, 9)), when))
            if self.rng.random() < 0.35:
                gifts.append(self.stamp(GiftCard(user=user), when))
            if self.rng.random() < 0.4:
                extras.append(
                    self.stamp(SavedAddress(user=user, label=self.rng.choice(
                        ["home", "home", "work"]), line=self.address()), when)
                )  # fmt: skip
        User.objects.bulk_create(users)
        CustomerProfile.objects.bulk_create(profiles)
        LoyaltyCard.objects.bulk_create(cards)
        GiftCard.objects.bulk_create(gifts)
        SavedAddress.objects.bulk_create(extras)
        self.people = users
        self.regulars = users[: max(1, len(users) // 3)]  # a third of customers order most
        self.card_history(cards)
        self.gift_history(gifts)
        self.devices(users)

    def card_history(self, cards):
        rows = []
        for card in cards:
            redeems = self.rng.choice([0, 0, 0, 1, 1, 2])
            for n in range(card.stamps + redeems * STAMPS_PER_REWARD):
                cafe = self.rng.choice(self.cafes)
                rows.append(
                    self.stamp(
                        LoyaltyActivity(card=card, type="earn", location_name=cafe.name,
                                        description=f"+1 stamp · {cafe.name}"),
                        self.ago(self.rng.randint(1, self.days), n % 8),
                    )
                )  # fmt: skip
            for _ in range(redeems):
                rows.append(
                    self.stamp(
                        LoyaltyActivity(card=card, type="redeem", location_name="In store",
                                        description="Free coffee redeemed"),
                        self.ago(self.rng.randint(1, self.days)),
                    )
                )  # fmt: skip
        LoyaltyActivity.objects.bulk_create(rows, batch_size=1000)

    def gift_history(self, gifts):
        rows = []
        for gift in gifts:
            added = self.rng.choice([2500, 5000, 5000, 10000])
            spent = min(self.rng.choice([0, 0, 1290, 2150, added]), added)
            rows.append(self.stamp(GiftCardActivity(
                card=gift, kind="added", description="Added to your balance",
                amount_cents=added), self.ago(self.rng.randint(20, 90))))  # fmt: skip
            if spent:
                rows.append(self.stamp(GiftCardActivity(
                    card=gift, kind="spent", description="Spent on an app order",
                    amount_cents=spent), self.ago(self.rng.randint(1, 19))))  # fmt: skip
            gift.balance_cents = added - spent
        GiftCard.objects.bulk_update(gifts, ["balance_cents"])
        GiftCardActivity.objects.bulk_create(rows)

    def devices(self, users):
        alphabet = string.ascii_letters + string.digits
        rows = [
            self.stamp(
                PushDevice(
                    user=user,
                    token="ExponentPushToken[" + "".join(self.rng.choices(alphabet, k=22)) + "]",
                    platform=self.rng.choice(["ios", "ios", "android"]),
                ),
                user.date_joined,
            )
            for user in users
            if self.rng.random() < 0.65
        ]
        PushDevice.objects.bulk_create(rows)

    # --- cafés and website ----------------------------------------------------------------
    def cafe_setup(self):
        for index, cafe in enumerate(self.cafes):
            if index < 6:
                BookingRule.objects.create(
                    location=cafe, is_enabled=True, slot_minutes=30, max_party_size=8,
                    max_covers_per_slot=20, min_lead_minutes=60, max_days_ahead=30,
                )  # fmt: skip
            for number in range(1, 11):
                TillTable.objects.create(
                    location=cafe, label=f"T{number}", seats=self.rng.choice([2, 2, 4, 4, 6]),
                    zone=["Window", "Inside", "Courtyard"][number % 3], sort_order=number,
                )  # fmt: skip
            for day, reason, closed in self.holidays():
                SpecialHours.objects.create(
                    location=cafe, date=day, reason=reason, is_closed=closed,
                    opens_at=None if closed else time(7), closes_at=None if closed else time(12),
                )  # fmt: skip
            for item in self.rng.sample(self.items, min(self.rng.randint(1, 2), len(self.items))):
                override, _ = LocationMenuItem.objects.get_or_create(location=cafe, menu_item=item)
                override.is_available = False
                override.save()
                self.audit(
                    self.crew[cafe.pk][1], override, {"is_available": True},
                    {"is_available": False}, self.ago(0, self.rng.randint(1, 6)),
                )  # fmt: skip
        for code, label, kind, value, cafe, ends, active in [
            ("WELCOME10", "10% off your first order", "pct", 10, None, None, True),
            ("STUDENT15", "Student 15% off", "pct", 15, None, None, True),
            ("FIVEOFF", "$5 off", "amt", 500, None, self.today + timedelta(days=30), True),
            ("BRADDON20", "Braddon locals 20%", "pct", 20, self.cafes[0], None, True),
            ("WINTER", "Winter warmer $3 off", "amt", 300, None, self.today - timedelta(days=20),
             True),
            ("STAFF50", "Staff 50%", "pct", 50, None, None, False),
        ]:  # fmt: skip
            Promotion.objects.create(
                code=code, label=label, kind=kind, location=cafe, ends_on=ends, is_active=active,
                percent=value if kind == "pct" else None,
                amount_cents=value if kind == "amt" else None,
            )  # fmt: skip

    def holidays(self):
        year = (
            self.today.year if self.today <= date(self.today.year, 12, 25) else self.today.year + 1
        )
        return [
            (date(year, 12, 24), "Christmas Eve — closing at noon", False),
            (date(year, 12, 25), "Christmas Day", True),
            (date(year, 12, 26), "Boxing Day", True),
            (date(year, 12, 31), "New Year's Eve — closing at noon", False),
            (date(year + 1, 1, 1), "New Year's Day", True),
            (date(year + 1, 1, 26), "Australia Day", True),
        ]

    def website_content(self):
        pages = {}
        for slug, title, blurb in [
            ("home", "Healthy food, great coffee", "Ten cafés across Canberra."),
            ("about", "About EightyTwenty", "80% nourishing, 20% indulgent, 100% delicious."),
            ("catering", "Catering", "Breakfast, lunch and sweets for offices and events."),
            ("wholesale", "Wholesale", "Granola, protein balls and cold brew for your shelves."),
            ("locations", "Our cafés", "Find your nearest EightyTwenty."),
            ("privacy", "Privacy policy", "How we look after your information."),
            ("terms", "Terms of use", "The fine print."),
        ]:
            pages[slug] = Page.objects.create(
                slug=slug, title=title, status="published", published_at=self.ago(120),
                seo_title=f"{title} | EightyTwenty Canberra", seo_description=blurb,
            )  # fmt: skip
        blocks = [
            ("home", "hero", "hero", {"heading": "Eat well, feel good",
                                      "text": "Healthy brunch and specialty coffee in Canberra.",
                                      "cta": {"label": "See the menu", "url": "/menu"}}),
            ("home", "cafes", "cta", {"heading": "Ten cafés, one menu",
                                      "cta": {"label": "Find a café", "url": "/locations"}}),
            ("about", "story", "rich_text", {"html": "<p>EightyTwenty started in Braddon with "
                                             "one idea: food that is good for you should "
                                             "taste great too.</p>"}),
            ("catering", "intro", "rich_text", {"html": "<p>Platters, bowls and sweets for 10 to "
                                                "200 people, delivered across Canberra.</p>"}),
            ("catering", "gallery", "gallery", {"images": ["breakfast", "lunch", "sweets"]}),
            ("wholesale", "intro", "rich_text", {"html": "<p>Stock our granola, protein balls and "
                                                 "cold brew.</p>"}),
            ("home", "faq", "faq", {"items": ["Do you have gluten free options?",
                                              "Can I book a table?"]}),
        ]  # fmt: skip
        for order, (page, key, kind, data) in enumerate(blocks):
            ContentBlock.objects.create(page=pages[page], key=key, type=kind, data=data,
                                        sort_order=order)  # fmt: skip
        for order, (menu, label, url, page) in enumerate([
            ("header", "Menu", "/menu", None), ("header", "Locations", "", "locations"),
            ("header", "Catering", "", "catering"), ("header", "Wholesale", "", "wholesale"),
            ("header", "About", "", "about"), ("footer", "Privacy", "", "privacy"),
            ("footer", "Terms", "", "terms"), ("footer", "Gift cards", "/gift-cards", None),
            ("footer", "Contact", "mailto:info@eightytwentyfood.com.au", None),
        ]):  # fmt: skip
            NavigationItem.objects.create(
                menu=menu, label=label, url=url, page=pages.get(page), sort_order=order
            )
        for order, (slug, name, tag, line, fine) in enumerate([
            ("student-tuesdays", "Student Tuesdays", "In store · all cafés",
             "15% off everything on Tuesdays with a student card.", "Show a valid student ID."),
            ("birthday-treat", "Birthday treat", "In the app",
             "A free smoothie in your birthday week.", "Add your birthday in the app."),
            ("smoothie-hour", "Smoothie hour", "2–3pm weekdays",
             "Any regular smoothie for $8.", "Braddon, Kingston and Dickson."),
        ], start=1):  # fmt: skip
            Offer.objects.get_or_create(
                slug=slug, defaults={"name": name, "tag": tag, "line": line, "fine": fine,
                                     "sort_order": order},
            )  # fmt: skip
        for order, (question, answer) in enumerate([
            ("Do you cater for coeliacs?", "Yes. Gluten free bread and bowls are marked GF; tell "
             "the team so we can take extra care."),
            ("Can I use my gift card in store?", "Yes, at every café and in the app."),
            ("Do you take bookings?", "Most cafés take bookings for breakfast and lunch through "
             "the website or the app."),
            ("Is there parking?", "Each café page lists the nearest parking."),
        ], start=10):  # fmt: skip
            Faq.objects.get_or_create(
                question=question, defaults={"answer": answer, "sort_order": order}
            )

    # --- orders ---------------------------------------------------------------------------
    def line(self, item):
        price, labels = item.base_price_cents, []
        for link in list(item.modifier_links.all())[:2]:
            options = list(link.modifier_group.options.all())
            if options and (link.modifier_group.is_required or self.rng.random() < 0.3):
                option = self.rng.choice(options)
                price += option.price_delta_cents
                labels.append(option.name)
        qty = self.rng.choices([1, 2, 3], [80, 17, 3])[0]
        return item, qty, price, ", ".join(labels)

    def placed(self, day):
        hour = self.rng.choices([h for h, _ in PEAK_HOURS], [w for _, w in PEAK_HOURS])[0]
        minute = self.rng.randint(0, 59) if hour > 6 else self.rng.randint(30, 59)
        return self.at(day, hour, minute)

    def orders(self):
        app_numbers = iter(self.rng.sample(range(1000, 100000), 60000))
        self.bag = {"orders": [], "lines": [], "payments": [], "adjustments": [], "ledger": []}
        seq = defaultdict(int)
        for back in range(self.days - 1, -1, -1):
            day = self.today - timedelta(days=back)
            busy = 1.3 if day.weekday() >= 5 else 1.0
            for rank, cafe in enumerate(self.cafes):
                weight = 1.4 if rank == 0 else 1.0 - 0.04 * rank
                for till in (True, False):
                    base = self.rng.randint(14, 30) if till else self.rng.randint(2, 7)
                    for _ in range(int(base * busy * weight)):
                        at = self.placed(day)
                        if back == 0 and at > self.now:
                            continue
                        seq[cafe.pk] += 1
                        number = (
                            f"{self.codes[cafe.pk]}-{seq[cafe.pk]:05d}"
                            if till
                            else f"#8020-{next(app_numbers):04d}"
                        )
                        self.order(cafe, day, at, till, number, back)
        # A few orders "just placed", whatever the time of the run, so there is work waiting.
        live = ["received"] * 3 + ["confirmed", "preparing", "ready"] + ["preparing"] * 3
        for n, status in enumerate(live):
            cafe, till = self.cafes[n % len(self.cafes)], n >= 6
            at = self.now - timedelta(minutes=2 + 4 * n)
            seq[cafe.pk] += 1
            number = (
                f"{self.codes[cafe.pk]}-{seq[cafe.pk]:05d}"
                if till
                else f"#8020-{next(app_numbers):04d}"
            )
            self.order(cafe, timezone.localdate(at), at, till, number, 0, status)
        bag = self.bag
        Order.objects.bulk_create(bag["orders"], batch_size=1000)
        OrderLine.objects.bulk_create(bag["lines"], batch_size=2000)
        OrderPayment.objects.bulk_create(bag["payments"], batch_size=2000)
        OrderAdjustment.objects.bulk_create(bag["adjustments"], batch_size=1000)
        TillTransaction.objects.bulk_create(bag["ledger"], batch_size=2000)
        return len(bag["orders"])

    def order_status(self, at, back, till):
        if back:
            return self.rng.choices(["completed", "refunded", "cancelled"], [96, 1.5, 2.5])[0]
        if (self.now - at).total_seconds() > 40 * 60:
            return "completed"
        status = self.rng.choice(["received", "confirmed", "preparing", "ready"])
        return "preparing" if till and status == "received" else status

    def order(self, cafe, day, at, till, number, back, status=None):
        count = self.rng.choices([1, 2, 3, 4], [40, 35, 15, 10])[0]
        picks = self.rng.choices(self.items, self.weights, k=count)
        picked = [self.line(item) for item in dict.fromkeys(picks)]
        subtotal = sum(qty * price for _, qty, price, _ in picked)
        server = self.rng.choice(self.crew[cafe.pk])
        status = status or self.order_status(at, back, till)
        customer = None
        if not till:
            customer = self.rng.choice(self.regulars if self.rng.random() < 0.7 else self.people)
        if till:
            method = self.rng.choices(["takeaway", "dine_in", "pickup"], [55, 40, 5])[0]
        else:
            method = self.rng.choices(["pickup", "dine_in", "delivery"], [80, 15, 5])[0]
        discount, discounts = 0, []
        if till and self.rng.random() < 0.05:
            code, rate = self.rng.choice([("WELCOME10", 10), ("STUDENT15", 15)])
            discount = (subtotal * rate + 50) // 100
            discounts = [{"label": f"{code} · {rate}% off", "amount": discount / 100,
                          "code": code}]  # fmt: skip
        delivery = (subtotal + 5) // 10 if method == "delivery" else 0
        coffee_prices = [
            price for item, _, price, _ in picked if is_coffee(item.category.slug, item.name)
        ]
        coffees = sum(qty for item, qty, _, _ in picked if is_coffee(item.category.slug, item.name))
        reward = (
            min(coffee_prices) if not till and coffee_prices and self.rng.random() < 0.05 else 0
        )
        total = subtotal - discount + delivery - reward
        staff_name = f"{server.first_name} {server.last_name[0]}." if till else ""
        terminal = f"{cafe.slug.upper()}-TILL-{self.rng.choice([1, 1, 2])}" if till else ""
        handled = status != "received"
        order = self.stamp(
            Order(
                number=number, channel="pos" if till else "app", location=cafe,
                customer=customer, method=method, status=status, placed_at=at,
                subtotal_cents=subtotal, discount_cents=discount, discounts=discounts,
                delivery_cents=delivery, reward_cents=reward, reward_redeemed=bool(reward),
                total_cents=total,
                table_number=str(self.rng.randint(1, 10)) if till and method == "dine_in" else "",
                contact_name=customer.get_full_name() if customer else "",
                contact_phone=customer.phone if customer else "",
                delivery_address=self.address() if method == "delivery" else "",
                staff_name=staff_name, terminal_id=terminal,
                stamps_earned=0 if till else max(0, coffees - (1 if reward else 0)),
                note=self.rng.choice(ORDER_NOTES),
                handled_by=server if handled else None,
                handled_at=at + timedelta(minutes=2) if handled else None,
                history=[
                    {"at": f"{at:%I:%M %p}".lower(),
                     "what": f"Created on till by {server.first_name}"},
                    {"at": f"{at + timedelta(minutes=1):%I:%M %p}".lower(),
                     "what": "Sent to kitchen"},
                ] if till else [],
            ),
            at + timedelta(minutes=8 if status in ("completed", "refunded") else 0),
        )  # fmt: skip
        if not till:
            order.payment_choice = self.rng.choices(
                ["apple_pay", "saved_card", "new_card"], [55, 35, 10]
            )[0]
            order.payment_label = {
                "apple_pay": "Apple Pay",
                "saved_card": "Visa ·· 4242",
                "new_card": "Mastercard ·· 5100",
            }[order.payment_choice]
            order.payment_reference = f"pi_demo_{number[-5:]}"
        self.bag["orders"].append(order)
        for position, (item, qty, price, label) in enumerate(picked):
            self.bag["lines"].append(self.stamp(OrderLine(
                order=order, menu_item=item, item_slug=item.slug, name=item.name, qty=qty,
                unit_price_cents=price, modifiers_label=label, position=position,
                key=f"L{position + 1}", prep="preparing" if status == "preparing" else "ready",
            ), at))  # fmt: skip
        if till and status in ("completed", "refunded"):
            self.till_money(order, cafe, day, at)
        if status == "refunded":
            self.refund(order, cafe, at, till)
        if not till and back <= 14:
            self.app_trail(order, server, at, status)

    def till_money(self, order, cafe, day, at):
        how = self.rng.choices(["card", "cash", "wallet", "gift"], [70, 18, 10, 2])[0]
        tip = self.rng.choice([0] * 12 + [100, 200, 300, 500]) if how == "card" else 0
        total, number = order.total_cents, order.number
        self.bag["payments"].append(self.stamp(OrderPayment(
            order=order, method=how, amount_cents=total, tip_cents=tip,
            reference=f"pay-{number}", staff_name=order.staff_name,
            taken_at=f"{at + timedelta(minutes=1):%I:%M %p}".lower(),
            terminal_id=order.terminal_id,
        ), at + timedelta(minutes=1)))  # fmt: skip
        if how == "cash":
            self.cash[(cafe.pk, day)] += total
        self.bag["ledger"].append(self.stamp(TillTransaction(
            location=cafe, kind="sale", order_number=number, terminal_id=order.terminal_id,
            amount_cents=total, gst_cents=round(total / 11), occurred_at=at,
            staff_name=order.staff_name, reference=f"sale-{number}",
        ), at))  # fmt: skip

    def refund(self, order, cafe, at, till):
        later = at + timedelta(minutes=15)
        total, number = order.total_cents, order.number
        self.bag["adjustments"].append(self.stamp(OrderAdjustment(
            order=order, key=f"adj-{number}", mode="refund", amount_cents=total,
            reason=self.rng.choice(REFUND_REASONS), staff_name=order.staff_name or "Team",
            approver_name=self.managers[cafe.pk].first_name,
            made_at=f"{later:%I:%M %p}".lower(),
        ), later))  # fmt: skip
        if till:
            self.bag["ledger"].append(self.stamp(TillTransaction(
                location=cafe, kind="refund", order_number=number, terminal_id=order.terminal_id,
                amount_cents=-total, gst_cents=-round(total / 11), occurred_at=later,
                staff_name=order.staff_name, reference=f"refund-{number}",
            ), later))  # fmt: skip

    def app_trail(self, order, server, at, status):
        steps = ["confirmed", "preparing", "ready", "completed"]
        reached = steps[: steps.index(status) + 1] if status in steps else []
        previous = "received"
        for n, step in enumerate(reached, start=1):
            self.audit(server, order, {"status": previous}, {"status": step},
                       at + timedelta(minutes=2 * n))  # fmt: skip
            previous = step
        if status in ("ready", "completed"):
            self.notes.append(self.stamp(AppNotification(
                user=order.customer, kind="order", unread=status == "ready",
                text=f"Your order {order.number} is ready to collect at {order.location.name}.",
            ), at + timedelta(minutes=8)))  # fmt: skip

    # --- bookings and enquiries -----------------------------------------------------------
    def bookings(self):
        rows = []
        for offset in range(-self.days, 31):
            day = self.today + timedelta(days=offset)
            busy = 2 if day.weekday() >= 5 else 0
            for cafe in self.cafes[:6]:
                for _ in range(self.rng.randint(0, 3 + busy)):
                    rows.append(self.booking(cafe, day, offset))
        Booking.objects.bulk_create(rows, batch_size=1000)
        return len(rows)

    def booking_status(self, when, offset):
        if when < self.now:
            return self.rng.choices(["seated", "no_show", "cancelled", "declined"],
                                    [78, 6, 10, 6])[0]  # fmt: skip
        # Most requests are answered within a day; a few recent ones still wait.
        if offset <= 2:
            return self.rng.choices(["confirmed", "requested", "cancelled"], [78, 17, 5])[0]
        return self.rng.choices(["confirmed", "requested", "cancelled"], [94, 3, 3])[0]

    def booking(self, cafe, day, offset):
        slot = time(self.rng.randint(7, 13), self.rng.choice([0, 30]))
        when = self.at(day, slot.hour, slot.minute)
        guest = self.rng.choice(self.people)
        source = self.rng.choices(["web", "app", "staff"], [50, 35, 15])[0]
        status = self.booking_status(when, offset)
        made = when - timedelta(days=self.rng.randint(1, 14), hours=self.rng.randint(0, 10))
        made = min(made, self.now - timedelta(hours=1))
        manager = self.managers[cafe.pk]
        handled = status != "requested"
        booking = self.stamp(Booking(
            location=cafe, date=day, time=slot,
            party_size=self.rng.choices([2, 3, 4, 5, 6, 8], [40, 15, 25, 7, 8, 5])[0],
            name=guest.get_full_name(), email=guest.email, phone=guest.phone, status=status,
            source=source,
            customer=guest if source == "app" or self.rng.random() < 0.5 else None,
            seating=self.rng.choice(["indoor", "outdoor"]) if source == "app" else "",
            notes=self.rng.choice(BOOKING_NOTES),
            handled_by=manager if handled else None,
            handled_at=made + timedelta(hours=2) if handled else None,
        ), made)  # fmt: skip
        trail = {"seated": ["confirmed", "seated"], "no_show": ["confirmed", "no_show"],
                 "cancelled": ["confirmed", "cancelled"], "declined": ["declined"],
                 "confirmed": ["confirmed"]}.get(status, [])  # fmt: skip
        previous = "requested"
        for n, step in enumerate(trail):
            moment = made + timedelta(hours=2) if n == 0 else min(when, self.now)
            self.audit(manager, booking, {"status": previous}, {"status": step}, moment)
            previous = step
        if status in ("confirmed", "seated", "no_show"):
            failed = offset in (-1, 0) and self.rng.random() < 0.3
            self.email(
                guest.email, f"Your booking at EightyTwenty {cafe.name} is confirmed",
                f"Hi {guest.first_name}, see you on {day:%A %d %B} at {slot:%I:%M %p}.",
                made + timedelta(hours=2), "failed" if failed else "sent",
                "Mailbox unavailable" if failed else "",
            )  # fmt: skip
        return booking

    def enquiry_status(self, age, kind):
        if kind == "contact":
            return "closed" if age > 3 else self.rng.choice(["new", "in_progress"])
        if age < 2:
            return self.rng.choice(["new", "new", "in_progress"])
        if age < 10:
            return self.rng.choice(["in_progress", "quoted", "new"])
        return self.rng.choices(["won", "lost", "quoted", "closed"], [45, 25, 15, 15])[0]

    def enquiries(self):
        packages = list(CateringPackage.objects.filter(is_active=True))
        rows = []
        for index in range(max(15, self.days * 2)):
            age = self.rng.uniform(0, self.days)
            made = self.now - timedelta(days=age)
            cafe = self.rng.choice(self.cafes)
            kind = self.rng.choices(["catering", "wholesale", "contact"], [55, 20, 25])[0]
            guest = self.rng.choice(self.people)
            status = self.enquiry_status(age, kind)
            message = self.rng.choice(
                {"catering": CATERING_MESSAGES, "wholesale": WHOLESALE_MESSAGES,
                 "contact": CONTACT_MESSAGES}[kind]
            ).format(suburb=self.rng.choice(SUBURBS)[0], cafe=cafe.name)  # fmt: skip
            catering = kind == "catering"
            company = ""
            if catering and index % 2:
                company = self.rng.choice(COMPANIES)
            elif kind == "wholesale":
                company = self.rng.choice(GROCERS)
            manager = self.managers[cafe.pk]
            enquiry = self.stamp(Enquiry(
                kind=kind, name=guest.get_full_name(), email=guest.email, phone=guest.phone,
                company=company, location=cafe, message=message, status=status,
                event_date=(made + timedelta(days=self.rng.randint(5, 30))).date()
                if catering else None,
                headcount=self.rng.choice([10, 12, 20, 25, 30, 45, 60, 80]) if catering else None,
                package=self.rng.choice(packages) if catering and packages else None,
                assigned_to=manager if status != "new" else None,
                internal_notes={"quoted": "Sent quote by email, following up Friday.",
                                "won": "Confirmed and invoiced. Delivery booked.",
                                "lost": "Went with another caterer (price)."}.get(status, ""),
                customer=guest if index % 3 == 0 else None,
                payload={"occasion": self.rng.choice(["Office lunch", "Workshop", "Birthday",
                                                      "Board meeting", "Baby shower"]),
                         "time": self.rng.choice(["8:30 am", "11:30 am", "12:00 pm"]),
                         "dietary": self.rng.choice(["Vegetarian, Gluten free", "Vegan", "None"]),
                         "source": self.rng.choice(["app", "pos", "web"])}
                if catering else {},
            ), made)  # fmt: skip
            rows.append(enquiry)
            if status != "new":
                self.audit(manager, enquiry, {"status": "new"}, {"status": "in_progress"},
                           made + timedelta(hours=3))  # fmt: skip
                if status != "in_progress":
                    self.audit(manager, enquiry, {"status": "in_progress"}, {"status": status},
                               made + timedelta(days=min(age, 2)))  # fmt: skip
        Enquiry.objects.bulk_create(rows)
        return len(rows)

    # --- till shifts ----------------------------------------------------------------------
    def shifts(self):
        rows, ledger = [], []
        for cafe in self.cafes:
            crew = self.crew[cafe.pk]
            for back in range(min(self.days, 60) - 1, -1, -1):
                day = self.today - timedelta(days=back)
                shift, moves = self.shift(cafe, crew, day, back)
                rows.append(shift)
                for move in moves:
                    later = shift.created_at + timedelta(hours=3)
                    ledger.append(self.stamp(TillTransaction(
                        location=cafe, kind=f"cash-{move['type']}", terminal_id=shift.terminal_id,
                        amount_cents=move["amount"] if move["type"] == "in" else -move["amount"],
                        occurred_at=later, staff_name=move["by"], reference=move["id"],
                    ), later))  # fmt: skip
        CashShift.objects.bulk_create(rows)
        TillTransaction.objects.bulk_create(ledger)

    def shift(self, cafe, crew, day, back):
        opener, closer = self.rng.choice(crew[1:] or crew), crew[0]
        moves = []
        if self.rng.random() < 0.3:
            moves.append({"id": f"m-{cafe.slug}-{day}", "type": "out", "amount": 2500,
                          "reason": "Milk run", "by": opener.first_name})  # fmt: skip
        if self.rng.random() < 0.15:
            moves.append({"id": f"m2-{cafe.slug}-{day}", "type": "in", "amount": 5000,
                          "reason": "Change top-up", "by": closer.first_name})  # fmt: skip
        cash = self.cash[(cafe.pk, day)]
        moved = sum(m["amount"] if m["type"] == "in" else -m["amount"] for m in moves)
        expected = 30000 + cash + moved
        opened = self.at(day, 6, self.rng.randint(5, 25))
        shift = CashShift(
            reference=f"SHIFT-{cafe.slug.upper()}-{day:%Y%m%d}", location=cafe,
            terminal_id=f"{cafe.slug.upper()}-TILL-1", staff_name=opener.get_full_name(),
            opened_label=f"{opened:%I:%M %p}".lower(), float_cents=30000,
            cash_sales_cents=cash, moves=moves,
        )  # fmt: skip
        if back:
            variance = self.rng.choice([0] * 8 + [-50, -200, 100, 500, -1000])
            closed = self.at(day, 15, self.rng.randint(10, 40))
            shift.status, shift.closed_at = "closed", closed
            shift.closed_label = f"{closed:%I:%M %p}".lower()
            shift.closed_by = closer.get_full_name()
            shift.expected_cents, shift.counted_cents = expected, expected + variance
            shift.variance_cents = variance
            shift.note = "Short — counted the float twice" if variance <= -1000 else ""
            shift.approved_by = closer.first_name if variance else ""
        return self.stamp(shift, opened), moves
