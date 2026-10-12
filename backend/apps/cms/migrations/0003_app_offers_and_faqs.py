"""Starting content for the mobile app (fixtures/content.ts), editable in BOS → Website."""

from django.db import migrations

FAQS = [
    (
        "How does the coffee card work?",
        "Every coffee earns a stamp. Collect nine and your tenth coffee is on us — any coffee, any size.",
    ),
    (
        "Can I change my order after paying?",
        "Once submitted, our kitchen gets straight to work, so orders cannot be changed or cancelled.",
    ),
    ("Is there a card surcharge?", "Card payments carry a 2.95% surcharge."),
    (
        "How much notice do bookings need?",
        "At least 12 hours. For a table today, text 0422 573 102.",
    ),
    (
        "Where can I use a gift card?",
        "At any EightyTwenty café. eGift cards are issued and redeemed through Square, and "
        "physical cards are available in store.",
    ),
    (
        "Which cafés are gluten free?",
        "Phillip is 100% Gluten Free by EightyTwenty, and Belconnen is our North Side gluten free café.",
    ),
]


def seed(apps, schema_editor):
    Offer = apps.get_model("cms", "Offer")
    Faq = apps.get_model("cms", "Faq")
    if not Offer.objects.exists():
        Offer.objects.create(
            slug="keepcups",
            name="Keep Cups",
            tag="In store · all cafés",
            line="Buy a keep cup in store and the next two coffees are on us.",
            fine="Ongoing · redeemed at the counter",
        )
    if not Faq.objects.exists():
        for order, (question, answer) in enumerate(FAQS):
            Faq.objects.create(question=question, answer=answer, sort_order=order)


class Migration(migrations.Migration):
    dependencies = [("cms", "0002_faq_offer"), ("core", "0004_alter_auditlog_options")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
