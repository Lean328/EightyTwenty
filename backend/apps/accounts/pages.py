"""Plain pages customers open from emails (the mobile app has no reset screen of its own)."""

from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.http import require_http_methods

from apps.core.exceptions import DomainError

from . import services


@never_cache
@sensitive_post_parameters("password", "confirm")
@require_http_methods(["GET", "POST"])
def reset_password(request):
    data = request.POST if request.method == "POST" else request.GET
    context = {"uid": data.get("uid", ""), "token": data.get("token", ""), "error": ""}
    try:
        with transaction.atomic():
            services.token_user(context["uid"], context["token"], services.default_token_generator)
    except DomainError:
        context["expired"] = True
        return render(request, "account/reset_password.html", context)
    if request.method == "POST":
        password = request.POST.get("password", "")
        if password != request.POST.get("confirm", ""):
            context["error"] = "The two passwords don’t match."
        else:
            try:
                services.reset_password(
                    {"uid": context["uid"], "token": context["token"], "password": password}
                )
            except ValidationError as exc:
                context["error"] = " ".join(exc.messages)
            else:
                context["done"] = True
    return render(request, "account/reset_password.html", context)
