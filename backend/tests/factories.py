import factory

from apps.accounts.models import User
from apps.locations.models import Location
from apps.menu.models import Category, MenuItem


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    password = factory.django.Password("A-strong-password-2026")
    role = "customer"


class LocationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Location

    slug = factory.Sequence(lambda n: f"branch-{n}")
    name = factory.Sequence(lambda n: f"Branch {n}")
    is_published = True
    status = "open"
    fulfilment_methods = ["pickup", "dine_in"]


class CategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Category

    slug = factory.Sequence(lambda n: f"category-{n}")
    name = "All Day"


class MenuItemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = MenuItem

    slug = factory.Sequence(lambda n: f"dish-{n}")
    name = "Sample dish"
    category = factory.SubFactory(CategoryFactory)
    base_price_cents = 1090
    is_published = True
