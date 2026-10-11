import ipaddress
import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.forms.models import model_to_dict
from rest_framework.throttling import BaseThrottle

from .models import AuditLog


def snapshot(instance):
    if instance is None:
        return None
    data = model_to_dict(instance)
    for key in ["password", "last_login", "user_permissions", "groups"]:
        data.pop(key, None)
    data["id"] = str(instance.pk)
    for key, value in list(data.items()):
        if isinstance(value, list):
            data[key] = [str(getattr(v, "pk", v)) for v in value]
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


def audit(request, instance, before=None, action="update", after=None):
    ident = BaseThrottle().get_ident(request)
    try:
        ip = str(ipaddress.ip_address(ident))
    except ValueError:
        ip = None
    return AuditLog.objects.create(
        actor=request.user,
        action=action,
        entity_type=instance._meta.label_lower,
        entity_id=str(instance.pk),
        before=before,
        after=after if after is not None else snapshot(instance),
        ip=ip,
    )


@transaction.atomic
def save_managed(serializer, request):
    before = snapshot(serializer.instance)
    obj = serializer.save(
        updated_by=request.user,
        **({"created_by": request.user} if serializer.instance is None else {}),
    )
    audit(request, obj, before, "create" if before is None else "update")
    return obj
