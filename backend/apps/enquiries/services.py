from django.db import transaction

from apps.notifications.services import enqueue_email

from .models import Enquiry


@transaction.atomic
def create_enquiry(data):
    enquiry = Enquiry.objects.create(**data)
    enqueue_email(
        enquiry.email,
        f"Enquiry received: {enquiry.reference}",
        f"Thank you {enquiry.name}. We received your {enquiry.kind} enquiry. Our team will contact you. Reference: {enquiry.reference}.",
        f"enquiry-{enquiry.pk}",
    )
    return enquiry
