"""Compile backend/locale/*/LC_MESSAGES/django.po to .mo without GNU gettext.

Only plain msgid/msgstr pairs are supported, which is all the workspace uses.
Run from anywhere: python scripts/compile_messages.py
"""

import ast
import struct
from pathlib import Path

LOCALE = Path(__file__).resolve().parent.parent / "backend" / "locale"


def parse(po):
    """msgid -> msgstr, keeping the header entry and skipping untranslated strings."""
    entries, msgid, current = {}, None, None
    for line in po.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("msgid "):
            msgid = current = [ast.literal_eval(line[6:])]
        elif line.startswith("msgstr "):
            current = [ast.literal_eval(line[7:])]
            entries["".join(msgid)] = current
        elif line.startswith('"') and current is not None:
            current.append(ast.literal_eval(line))
    return {k: "".join(v) for k, v in entries.items() if k == "" or "".join(v)}


def write_mo(entries, path):
    keys = sorted(entries)
    ids = [k.encode() for k in keys]
    strs = [entries[k].encode() for k in keys]
    start = 7 * 4 + 16 * len(keys)
    offsets, data = [], b""
    for chunk in ids + strs:
        offsets.append((len(chunk), start + len(data)))
        data += chunk + b"\0"
    header = struct.pack(
        "<7I", 0x950412DE, 0, len(keys), 28, 28 + 8 * len(keys), 0, start
    )
    table = b"".join(struct.pack("<2I", *pair) for pair in offsets)
    path.write_bytes(header + table + data)


for po in LOCALE.glob("*/LC_MESSAGES/*.po"):
    write_mo(parse(po), po.with_suffix(".mo"))
    print(f"compiled {po.relative_to(LOCALE)}")
