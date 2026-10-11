# One clock across the workspace: Django's en-AU default prints "10 a.m.",
# while the overview and schedule say "10:00 AM". Anything not set here falls
# back to Django's own en-AU formats (input formats included).
DATE_FORMAT = "j M Y"
TIME_FORMAT = "g:i A"
DATETIME_FORMAT = "j M Y, g:i A"
SHORT_DATETIME_FORMAT = "d/m/Y g:i A"
