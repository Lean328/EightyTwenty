"""Invoke authenticated maintenance without printing secrets or PII."""
import os
import urllib.error
import urllib.request

base = os.environ["BOS_API_BASE"].rstrip("/")
if not base.startswith("https://"):
    raise SystemExit("BOS_API_BASE must use HTTPS")
for job in ["retry-emails", "cleanup"]:
    request = urllib.request.Request(
        f"{base}/api/v1/jobs/{job}",
        method="POST",
        headers={"X-Job-Token": os.environ["JOB_TOKEN"]},
        data=b"",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            print(job, response.status)
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"{job} failed: HTTP {exc.code}") from None
