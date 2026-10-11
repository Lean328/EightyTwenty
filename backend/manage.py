#!/usr/bin/env python
import os
import sys

if __name__ == "__main__":
    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
    if "migrate" in sys.argv:
        os.environ["USE_MIGRATION_DATABASE"] = "1"
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)
