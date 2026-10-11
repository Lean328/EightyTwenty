"""Choose one DST-aware daily backup window (03:00 on the skipped 02:00 day)."""
import os
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

local_day = datetime.now(ZoneInfo("Australia/Sydney")).date()
target = datetime.combine(local_day, datetime.min.time(), ZoneInfo("Australia/Sydney")).replace(hour=2).astimezone(UTC)
# The selected scheduled invocation is determined by its UTC hour, not runner delays.
scheduled_hour = int(os.environ.get("SCHEDULE", "0 0 * * *").split()[1])
if os.environ.get("EVENT_NAME") == "workflow_dispatch":
    run = True
else:
    run = scheduled_hour == target.hour
with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
    output.write(f"run={str(run).lower()}\n")
