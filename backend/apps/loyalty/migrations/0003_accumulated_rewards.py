from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("loyalty", "0002_wallet_passes")]
    operations = [
        migrations.RemoveConstraint(model_name="loyaltycard", name="loyalty_stamp_cap"),
        migrations.AlterField(model_name="loyaltycard", name="stamps", field=models.PositiveIntegerField(default=0, help_text="Total unspent stamp units; each nine units is one reward.")),
    ]
