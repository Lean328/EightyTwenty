import json
from pathlib import Path

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.locations.models import Location
from apps.menu.models import MenuItem, ModifierGroup

pytestmark = pytest.mark.django_db
SNAPSHOT = Path(__file__).resolve().parents[2] / "docs" / "examples" / "mock-snapshot.json"


def test_import_roundtrips_compatibility_snapshot_and_shared_groups(client):
    source = json.loads(SNAPSHOT.read_text())
    call_command("seed_from_mock", str(SNAPSHOT))
    response = client.get("/api/v1/public/bootstrap").json()
    for key in ["LOCATIONS", "CATEGORIES", "MENU", "CATERING", "ORDER_RULES"]:
        assert response[key] == source[key], key
    assert ModifierGroup.objects.count() == 1
    with pytest.raises(CommandError, match="already has data"):
        call_command("seed_from_mock", str(SNAPSHOT))
    call_command("seed_from_mock", str(SNAPSHOT), update_existing=True)
    assert MenuItem.objects.count() == 2
    assert ModifierGroup.objects.count() == 1


def test_invalid_import_rolls_back_everything(tmp_path):
    source = json.loads(SNAPSHOT.read_text())
    source["MENU"][1]["price"] = "0.001"
    path = tmp_path / "bad.json"
    path.write_text(json.dumps(source))
    with pytest.raises(CommandError):
        call_command("seed_from_mock", str(path))
    assert not Location.objects.exists()
    assert not MenuItem.objects.exists()
