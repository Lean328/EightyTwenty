from django.db import migrations


def lock_down(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    quote = schema_editor.connection.ops.quote_name
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")
        roles = [row[0] for row in cursor.fetchall()]
        cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname = current_schema()")
        existing = {row[0] for row in cursor.fetchall()}
        tables = {model._meta.db_table for model in apps.get_models(include_auto_created=True)} | {"django_migrations"}
        for table in sorted(tables & existing):
            cursor.execute(f"ALTER TABLE {quote(table)} ENABLE ROW LEVEL SECURITY")
            for role in roles:
                cursor.execute(f"REVOKE ALL PRIVILEGES ON TABLE {quote(table)} FROM {quote(role)}")
        for role in roles:
            cursor.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM {quote(role)}")
            cursor.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM {quote(role)}")


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"), ("accounts", "0002_initial"), ("locations", "0001_initial"),
        ("media", "0001_initial"), ("menu", "0001_initial"), ("cms", "0001_initial"),
        ("bookings", "0001_initial"), ("enquiries", "0001_initial"), ("notifications", "0001_initial"),
        ("sessions", "0001_initial"), ("admin", "0003_logentry_add_action_flag_choices"),
        ("token_blacklist", "0013_alter_blacklistedtoken_options_and_more"),
    ]
    # Never automatically reopen PostgREST access when reversing migrations.
    operations = [migrations.RunPython(lock_down, reverse_code=migrations.RunPython.noop)]
