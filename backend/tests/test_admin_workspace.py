from datetime import UTC, datetime, time, timedelta

import pytest
from django.contrib import admin
from django.test import Client
from django.urls import reverse
from django.utils import timezone

from apps.bookings.models import Booking
from apps.cms.models import ContentBlock, Page
from apps.core.models import AuditLog, SiteSettings
from apps.enquiries.models import Enquiry
from apps.menu.models import LocationMenuItem, ModifierGroup, ModifierOption
from apps.notifications.models import EmailMessage

from .factories import LocationFactory, MenuItemFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    client = Client()
    client.force_login(UserFactory(is_staff=True, is_superuser=True, role="owner"))
    return client


def booking(location, **kwargs):
    return Booking.objects.create(
        location=location,
        date=kwargs.pop("date", timezone.localdate()),
        time=time(10),
        party_size=kwargs.pop("party_size", 2),
        name="Guest",
        email="guest@example.test",
        phone="0400000000",
        **kwargs,
    )


def test_all_domain_admin_lists_and_add_forms_render(admin_client):
    for model, model_admin in admin.site._registry.items():
        if not model.__module__.startswith("apps."):
            continue
        name = f"admin:{model._meta.app_label}_{model._meta.model_name}"
        response = admin_client.get(reverse(name + "_changelist"), follow=True)
        assert response.status_code == 200, model._meta.label
        if model_admin.has_add_permission(response.wsgi_request):
            assert admin_client.get(reverse(name + "_add")).status_code == 200, model._meta.label


def test_record_pages_render_with_workspace_shell(admin_client):
    user = UserFactory(is_staff=True)
    page = admin_client.get(reverse("admin:accounts_user_change", args=[user.pk])).content.decode()
    assert "Password is set" in page or "has no password" in page
    assert 'class="bos-sidebar"' in page and "bos/css/admin.css" in page
    item = booking(LocationFactory())
    page = admin_client.get(
        reverse("admin:bookings_booking_change", args=[item.pk])
    ).content.decode()
    assert "Confirm booking" in page and "bos-chip" in page
    assert "Location" in admin_client.get(reverse("admin:index")).content.decode()


def test_dashboard_scope_counts_and_hidden_overrides(admin_client):
    a, b = LocationFactory(), LocationFactory()
    booking(a, status="confirmed", party_size=4)
    booking(a, status="cancelled", party_size=8)
    booking(a, date=timezone.localdate() - timedelta(days=9))
    booking(b)
    item = MenuItemFactory()
    LocationMenuItem.objects.create(location=a, menu_item=item, is_available=False)
    LocationMenuItem.objects.create(location=b, menu_item=item, is_hidden=True)
    Enquiry.objects.create(
        kind="contact", name="Guest", email="guest@example.test", message="Hello", location=a
    )
    response = admin_client.get("/admin/", {"location": a.slug, "period": "7"})
    ctx = response.context
    assert ctx["totals"]["today_bookings"] == 1
    assert ctx["totals"]["today_covers"] == 4
    assert ctx["awaiting_count"] == 1  # A stale request must still be actionable.
    assert ctx["new_enquiry_count"] == 1
    assert ctx["menu_count"] == 1  # Hidden at another branch must not hide it here.
    assert ctx["unavailable_count"] == 1
    assert sum(day["count"] for day in ctx["trend"]) == 1
    assert len(ctx["trend"]) == 7
    assert str(a.pk) in ctx["pending_bookings_url"]
    for key in [
        "today_bookings_url",
        "pending_bookings_url",
        "new_enquiries_url",
        "unavailable_url",
    ]:
        assert admin_client.get(ctx[key]).status_code == 200
    assert admin_client.get("/admin/", {"location": "unknown"}).status_code == 404
    assert admin_client.get("/admin/", {"period": "invalid"}).context["period"] == 7


def test_dashboard_uses_sydney_day_boundary(admin_client, monkeypatch):
    monkeypatch.setattr(timezone, "now", lambda: datetime(2026, 10, 5, 14, 30, tzinfo=UTC))
    booking(LocationFactory(), date=datetime(2026, 10, 6).date())
    response = admin_client.get("/admin/")
    assert response.context["today"].isoformat() == "2026-10-06"
    assert response.context["totals"]["today_bookings"] == 1


def test_non_superuser_staff_cannot_view_reports_or_mutate(admin_client):
    admin_client.force_login(UserFactory(is_staff=True, role="manager"))
    assert admin_client.get("/admin/").status_code == 302
    item = booking(LocationFactory())
    assert (
        admin_client.post(
            reverse("admin:bookings_booking_transition", args=[item.pk, "confirmed"])
        ).status_code
        == 302
    )
    item.refresh_from_db()
    assert item.status == "requested"


def test_booking_action_is_post_only_audited_and_queues_email(admin_client):
    item = booking(LocationFactory())
    url = reverse("admin:bookings_booking_transition", args=[item.pk, "confirmed"])
    assert admin_client.get(url).status_code == 405
    assert (
        admin_client.get(reverse("admin:bookings_booking_change", args=[item.pk])).status_code
        == 200
    )
    assert admin_client.post(url).status_code == 302
    item.refresh_from_db()
    assert item.status == "confirmed"
    assert item.handled_by.is_superuser
    assert AuditLog.objects.filter(entity_id=str(item.pk), after__status="confirmed").exists()
    assert EmailMessage.objects.filter(dedup_key=f"booking-{item.pk}-confirmed").count() == 1
    # An expired/repeated button never queues a duplicate or bypasses transitions.
    admin_client.post(url)
    admin_client.post(reverse("admin:bookings_booking_transition", args=[item.pk, "declined"]))
    item.refresh_from_db()
    assert item.status == "confirmed"
    assert EmailMessage.objects.count() == 1


def test_booking_actions_require_csrf():
    client = Client(enforce_csrf_checks=True)
    client.force_login(UserFactory(is_staff=True, is_superuser=True))
    item = booking(LocationFactory())
    assert (
        client.post(
            reverse("admin:bookings_booking_transition", args=[item.pk, "confirmed"])
        ).status_code
        == 403
    )


def test_menu_form_saves_dollars_as_cents_and_preserves_slug(admin_client):
    item = MenuItemFactory(base_price_cents=2450)
    url = reverse("admin:menu_menuitem_change", args=[item.pk])
    response = admin_client.get(url)
    assert 'value="24.50"' in response.content.decode()
    version = SiteSettings.load().menu_version
    data = {
        "name": item.name,
        "slug": "tampered-slug",
        "category": str(item.category_id),
        "base_price_cents": "19.95",
        "is_published": "on",
        "sort_order": "0",
        "modifier_links-TOTAL_FORMS": "0",
        "modifier_links-INITIAL_FORMS": "0",
        "dietary_links-TOTAL_FORMS": "0",
        "dietary_links-INITIAL_FORMS": "0",
        "_save": "Save",
    }
    response = admin_client.post(url, data)
    assert response.status_code == 302, response.context["adminform"].form.errors
    original_slug = item.slug
    item.refresh_from_db()
    assert item.base_price_cents == 1995
    assert item.slug == original_slug
    assert item.updated_by.is_superuser
    assert SiteSettings.load().menu_version > version
    assert AuditLog.objects.filter(entity_id=str(item.pk), after__base_price_cents=1995).exists()
    data["base_price_cents"] = "19.999"
    assert admin_client.post(url, data).status_code == 200
    item.refresh_from_db()
    assert item.base_price_cents == 1995


def test_modifier_inline_saves_price_and_audit(admin_client):
    group = ModifierGroup.objects.create(name="Extras", code="extras")
    response = admin_client.post(
        reverse("admin:menu_modifiergroup_change", args=[group.pk]),
        {
            "name": "Extras",
            "code": "extras",
            "min_select": "0",
            "max_select": "3",
            "is_active": "on",
            "options-TOTAL_FORMS": "1",
            "options-INITIAL_FORMS": "0",
            "options-0-name": "Discount",
            "options-0-price_delta_cents": "-0.50",
            "options-0-sort_order": "0",
            "options-0-is_active": "on",
            "_save": "Save",
        },
    )
    assert response.status_code == 302
    option = ModifierOption.objects.get(group=group)
    assert option.price_delta_cents == -50
    assert option.created_by.is_superuser
    assert AuditLog.objects.filter(entity_id=str(option.pk), action="admin_create").exists()


def test_new_page_with_inline_content_validates_and_saves(admin_client):
    data = {
        "title": "Welcome",
        "slug": "welcome",
        "status": "draft",
        "blocks-TOTAL_FORMS": "1",
        "blocks-INITIAL_FORMS": "0",
        "blocks-0-key": "hero",
        "blocks-0-type": "hero",
        "blocks-0-data": '{"title":"Hello"}',
        "blocks-0-sort_order": "0",
        "blocks-0-is_active": "on",
        "_save": "Save",
    }
    response = admin_client.post(reverse("admin:cms_page_add"), data)
    assert response.status_code == 302, str(response.context["adminform"].form.errors) + str(
        [f.formset.errors for f in response.context["inline_admin_formsets"]]
    )
    assert ContentBlock.objects.get(page__slug="welcome").data == {"title": "Hello"}


def test_invalid_cms_data_has_form_error(admin_client):
    page = Page.objects.create(title="Home", slug="home")
    response = admin_client.post(
        reverse("admin:cms_contentblock_add"),
        {
            "page": str(page.pk),
            "key": "cta",
            "type": "cta",
            "data": '{"label":"Click","url":"javascript:alert(1)"}',
            "sort_order": 0,
            "is_active": "on",
        },
    )
    assert response.status_code == 200
    assert response.context["adminform"].form.errors
    assert not ContentBlock.objects.exists()
