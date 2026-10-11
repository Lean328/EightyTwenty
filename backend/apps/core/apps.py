from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"
    verbose_name = "Workspace"

    def ready(self):
        from django.contrib.admin.templatetags import admin_list

        from . import signals  # noqa: F401
        from .templatetags.bos_admin import boolean_chip

        # Django's lists, readonly fields and display_for_* all look this up at
        # call time, so one swap replaces the red/green icons everywhere.
        admin_list._boolean_icon = boolean_chip
