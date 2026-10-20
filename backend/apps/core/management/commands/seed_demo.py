"""Demo data for a local database: team, customers, 30 days of orders, bookings and enquiries."""

import random
from datetime import date, datetime, time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from apps.accounts.models import CustomerProfile, StaffAssignment, User
from apps.bookings.models import Booking
from apps.enquiries.models import CateringPackage, Enquiry
from apps.locations.models import Location
from apps.loyalty.models import GiftCard, GiftCardActivity, LoyaltyActivity, LoyaltyCard
from apps.loyalty.services import is_coffee
from apps.menu.models import MenuItem
from apps.orders.models import Order, OrderAdjustment, OrderLine, OrderPayment
from apps.orders.services import unique_number
from apps.pos import pins
from apps.pos.models import CashShift, Promotion, TillTable

OWNER_EMAIL = "owner@example.com"
FIRST = "Olivia Jack Charlotte Noah Amelia Leo Isla Henry Mia Lucas Ava Oscar Grace Theo Ruby "
FIRST += "Archie Chloe Hugo Zoe Max Ella Finn Lily Ethan Sophie Liam Harper Jasper Willow Kai"
LAST = "Smith Brown Wilson Taylor Jones Martin White Clarke Nguyen Chen Walker Hall Young King "
LAST += "Wright Scott Green Baker Adams Hill Lee Tran Kelly Murphy Ross Price Ward Cook Bell Reid"
NOTES = ["", "", "", "Window seat if possible", "Birthday — bringing a cake", "High chair please",
         "Running 10 minutes late", "One guest is coeliac"]  # fmt: skip
MESSAGES = [
    "Hi team, we'd love catering for our office lunch — mostly vegetarian. Could you send a quote?",
    "Looking for a morning tea platter for a baby shower on a Saturday. Do you deliver to Gungahlin?",
    "We run a small grocer in Kingston and would like to stock your granola. What are your "
    "wholesale prices?",
    "Can we book the back area for a team breakfast of about 20 people?",
]


def local(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


class Command(BaseCommand):
    help = (
        "Fill a LOCAL database with demo team members, customers, orders, bookings and "
        "enquiries so the workspace has something to show. Refuses any other database."
    )

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=30, help="Days of order history.")
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
        self.password = options["password"]
        self.today = timezone.localdate()
        self.cafes = list(
            Location.objects.filter(is_published=True, status="open").order_by("sort_order")
        )
        self.items = list(
            MenuItem.objects.filter(is_published=True, base_price_cents__gt=0, location=None)
            .select_related("category")
            .prefetch_related("modifier_links__modifier_group__options")
        )
        with transaction.atomic():
            team = self.team()
            customers = self.customers()
            self.till_setup()
            orders = self.orders(customers, team, options["days"])
            bookings = self.bookings(customers)
            enquiries = self.enquiries(customers)
            self.shifts(team)
        self.stdout.write(
            self.style.SUCCESS(
                f"Demo data: {len(team) + 1} team, {len(customers)} customers, {orders} orders, "
                f"{bookings} bookings, {enquiries} enquiries."
            )
        )
        self.stdout.write(
            f"Sign in at /login/ as {OWNER_EMAIL} (chain owner), manager.<cafe-slug>@example.com or "
            f"staff.<cafe-slug>@example.com, with the --password value. Till PINs: 1001, 1002, ..."
        )

    # --- people ---------------------------------------------------------------------------
    def person(self, email, first, last, **fields):
        user = User.objects.create_user(
            email=email, password=self.password, first_name=first, last_name=last, **fields
        )
        return user

    def team(self):
        self.person(OWNER_EMAIL, "Sam", "Nguyen", role="owner", is_staff=True, is_superuser=True)
        team, pin = [], 1001
        for cafe in self.cafes[:3]:
            for role, first, last in [("manager", "Lena", "Park"), ("staff", "Mia", "Tran")]:
                user = self.person(
                    f"{'manager' if role == 'manager' else 'staff'}.{cafe.slug}@example.com",
                    first, f"{last} ({cafe.name})", role=role, is_staff=True,
                )  # fmt: skip
                StaffAssignment.objects.create(user=user, location=cafe)
                pins.set_pin(user, str(pin))
                user.save(update_fields=["pos_pin"])
                pin += 1
                team.append(user)
        return team

    def customers(self):
        firsts, lasts, people = FIRST.split(), LAST.split(), []
        for index, (first, last) in enumerate(zip(firsts, lasts, strict=True)):
            user = self.person(
                f"{first.lower()}.{last.lower()}@example.com", first, last, role="customer",
                phone=f"04{self.rng.randint(10, 99)} {self.rng.randint(100, 999)} "
                f"{self.rng.randint(100, 999)}",
                email_verified=index % 3 != 0, marketing_opt_in=index % 2 == 0,
            )  # fmt: skip
            CustomerProfile.objects.create(
                user=user,
                preferred_location=self.rng.choice(self.cafes),
                birthday=date(1990, 1, 1) + timedelta(days=self.rng.randint(0, 9000))
                if index % 4 == 0
                else None,
            )
            card = LoyaltyCard.objects.create(user=user, stamps=self.rng.randint(0, 9))
            for _ in range(card.stamps):
                LoyaltyActivity.objects.create(
                    card=card, type="earn", description="+1 stamp",
                    location_name=self.rng.choice(self.cafes).name,
                )  # fmt: skip
            balance = self.rng.choice([0, 0, 2500, 5000])
            gift = GiftCard.objects.create(user=user, balance_cents=balance)
            if balance:
                GiftCardActivity.objects.create(
                    card=gift, kind="added", description="Added to your balance",
                    amount_cents=balance,
                )  # fmt: skip
            people.append(user)
        return people

    def till_setup(self):
        zones = ["Window", "Inside", "Courtyard"]
        for cafe in self.cafes[:3]:
            for number in range(1, 9):
                TillTable.objects.create(
                    location=cafe, label=f"T{number}", seats=self.rng.choice([2, 2, 4, 4, 6]),
                    zone=zones[number % 3], sort_order=number,
                )  # fmt: skip
        Promotion.objects.create(code="WELCOME10", label="10% off", kind="pct", percent=10)
        Promotion.objects.create(
            code="FIVEOFF", label="$5 off", kind="amt", amount_cents=500,
            ends_on=self.today + timedelta(days=30),
        )  # fmt: skip

    # --- orders ---------------------------------------------------------------------------
    def line(self, item):
        price, label = item.base_price_cents, ""
        links = list(item.modifier_links.all())
        if links:
            options = list(links[0].modifier_group.options.all())
            if options:
                option = self.rng.choice(options)
                price += option.price_delta_cents
                label = option.name
        return item, self.rng.choice([1, 1, 1, 2]), price, label

    def orders(self, customers, team, days):
        count = 0
        for back in range(days - 1, -1, -1):
            day = self.today - timedelta(days=back)
            for cafe in self.cafes:
                for _ in range(self.rng.randint(1, 4)):
                    self.order(cafe, day, back == 0, customers, team)
                    count += 1
        return count

    def order(self, cafe, day, today, customers, team):
        till = self.rng.random() < 0.7
        at = local(day, self.rng.randint(7, 14), self.rng.choice([0, 10, 20, 30, 40, 50]))
        if today:
            status = self.rng.choice(["received", "confirmed", "preparing", "ready", "completed"])
        else:
            status = self.rng.choices(["completed", "refunded", "cancelled"], [94, 3, 3])[0]
        lines = [
            self.line(item)
            for item in self.rng.sample(self.items, min(len(self.items), self.rng.randint(1, 4)))
        ]
        subtotal = sum(qty * price for _, qty, price, _ in lines)
        customer = None if till else self.rng.choice(customers)
        method = self.rng.choice(["dine_in", "takeaway", "pickup"]) if till else "pickup"
        staff = next((u for u in team if u.role == "staff"), None)
        order = Order.objects.create(
            number=unique_number(),
            channel="pos" if till else "app",
            location=cafe,
            customer=customer,
            method=method,
            status=status,
            subtotal_cents=subtotal,
            total_cents=subtotal,
            placed_at=at,
            contact_name=customer.get_full_name() if customer else "",
            contact_phone=customer.phone if customer else "",
            payment_choice="" if till else self.rng.choice(["apple_pay", "saved_card"]),
            payment_label="" if till else "Apple Pay",
            table_number=str(self.rng.randint(1, 8)) if method == "dine_in" else "",
            staff_name=staff.first_name + " T." if till and staff else "",
            terminal_id=f"{cafe.slug.upper()}-TILL-1" if till else "",
            stamps_earned=0
            if till
            else sum(qty for item, qty, _, _ in lines if is_coffee(item.category.slug, item.name)),
            history=[{"at": (at + timedelta(minutes=2)).isoformat(), "what": "Sent to kitchen"}]
            if till
            else [],
            note=self.rng.choice(["", "", "", "Extra hot please", "No onion"]),
        )
        for position, (item, qty, price, label) in enumerate(lines):
            OrderLine.objects.create(
                order=order, menu_item=item, item_slug=item.slug, name=item.name, qty=qty,
                unit_price_cents=price, modifiers_label=label, position=position,
            )  # fmt: skip
        if till and status in ("completed", "refunded"):
            OrderPayment.objects.create(
                order=order, method=self.rng.choice(["card", "card", "cash"]),
                amount_cents=subtotal, reference=f"pay-{order.number}", staff_name="Mia T.",
            )  # fmt: skip
        if status == "refunded":
            OrderAdjustment.objects.create(
                order=order, key=f"adj-{order.number}", mode="refund", amount_cents=subtotal,
                reason="Wrong order", staff_name="Lena P.",
            )  # fmt: skip
        Order.objects.filter(pk=order.pk).update(created_at=at, updated_at=at)

    # --- bookings and enquiries -----------------------------------------------------------
    def bookings(self, customers):
        count = 0
        for offset in range(-14, 15):
            day = self.today + timedelta(days=offset)
            for _ in range(self.rng.randint(0, 3)):
                guest = self.rng.choice(customers)
                if offset < 0:
                    status = self.rng.choices(["seated", "no_show", "cancelled"], [8, 1, 1])[0]
                elif offset == 0:
                    status = self.rng.choice(["confirmed", "seated", "requested"])
                else:
                    status = self.rng.choice(["requested", "confirmed", "confirmed"])
                booking = Booking.objects.create(
                    location=self.rng.choice(self.cafes), date=day,
                    time=time(self.rng.randint(7, 13), self.rng.choice([0, 30])),
                    party_size=self.rng.randint(2, 8), name=guest.get_full_name(),
                    email=guest.email, phone=guest.phone, status=status,
                    source=self.rng.choice(["web", "app", "staff"]),
                    customer=guest if self.rng.random() < 0.5 else None,
                    notes=self.rng.choice(NOTES),
                )  # fmt: skip
                made = local(day - timedelta(days=self.rng.randint(1, 6)), 9)
                Booking.objects.filter(pk=booking.pk).update(created_at=made, updated_at=made)
                count += 1
        return count

    def enquiries(self, customers):
        packages = list(CateringPackage.objects.filter(is_active=True))
        statuses = ["new", "new", "in_progress", "quoted", "won", "lost"]
        for index in range(15):
            guest = self.rng.choice(customers)
            kind = ["catering", "catering", "wholesale", "contact"][index % 4]
            enquiry = Enquiry.objects.create(
                kind=kind,
                name=guest.get_full_name(),
                email=guest.email,
                phone=guest.phone,
                company="Kingston Grocer" if kind == "wholesale" else "",
                location=self.rng.choice(self.cafes),
                event_date=self.today + timedelta(days=self.rng.randint(5, 30))
                if kind == "catering"
                else None,
                headcount=self.rng.choice([12, 20, 30, 45]) if kind == "catering" else None,
                package=self.rng.choice(packages) if kind == "catering" and packages else None,
                message=MESSAGES[index % len(MESSAGES)],
                status=statuses[index % len(statuses)],
                customer=guest if index % 2 else None,
                payload={"occasion": "Office lunch", "dietary": "Vegetarian, Gluten free"}
                if kind == "catering"
                else {},
            )
            made = timezone.now() - timedelta(days=index % 6, hours=self.rng.randint(1, 20))
            Enquiry.objects.filter(pk=enquiry.pk).update(created_at=made, updated_at=made)
        return 15

    def shifts(self, team):
        for cafe in self.cafes[:3]:
            for back in range(7, 0, -1):
                day = self.today - timedelta(days=back)
                variance = self.rng.choice([0, 0, 0, -150, 200])
                CashShift.objects.create(
                    reference=f"shift-{cafe.slug}-{day}", location=cafe,
                    terminal_id=f"{cafe.slug.upper()}-TILL-1", staff_name="Mia T.",
                    float_cents=20000, cash_sales_cents=35000, status="closed",
                    closed_at=local(day, 15), closed_by="Lena P.", expected_cents=55000,
                    counted_cents=55000 + variance, variance_cents=variance,
                )  # fmt: skip
            CashShift.objects.create(
                reference=f"shift-{cafe.slug}-{self.today}", location=cafe,
                terminal_id=f"{cafe.slug.upper()}-TILL-1", staff_name="Mia T.", float_cents=20000,
            )  # fmt: skip
