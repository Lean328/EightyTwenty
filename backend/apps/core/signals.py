from django.db.models import F
from django.db.models.signals import m2m_changed, post_delete, post_migrate, post_save
from django.dispatch import receiver

from .models import SiteSettings

PUBLIC_APPS = {"menu", "locations", "cms", "media"}


@receiver(post_save)
@receiver(post_delete)
def public_data_changed(sender, instance, **kwargs):
    if kwargs.get("raw"):
        return
    if sender._meta.app_label in PUBLIC_APPS or sender._meta.label_lower in {
        "enquiries.cateringpackage",
        "core.sitesettings",
    }:
        SiteSettings.objects.get_or_create(pk=SiteSettings._meta.get_field("id").default)
        SiteSettings.objects.update(menu_version=F("menu_version") + 1)


@receiver(m2m_changed)
def public_relations_changed(sender, instance, action, **kwargs):
    if action in {"post_add", "post_remove", "post_clear"} and instance._meta.app_label == "menu":
        public_data_changed(type(instance), instance)


@receiver(post_migrate)
def secure_future_tables(sender, using, apps=None, **kwargs):
    if sender.label != "core":
        return
    from importlib import import_module

    from django.db import connections

    if apps is None:
        from django.apps import apps

    connection = connections[using]
    if connection.vendor == "postgresql":
        with connection.schema_editor() as editor:
            import_module("apps.core.migrations.0002_lock_down_postgrest").lock_down(apps, editor)
