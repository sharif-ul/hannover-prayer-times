
import json
import re
from datetime import date
from pathlib import Path

path = Path("prayer-times.json")
data = json.loads(path.read_text(encoding="utf-8"))

if isinstance(data, dict):
    if "times" not in data or not isinstance(data["times"], list):
        raise SystemExit("ERROR: Expected a top-level 'times' array in the JSON file.")
    data = data["times"]

if not isinstance(data, list):
    raise SystemExit("ERROR: The JSON root must be an array or an object with a 'times' array.")

required = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
seen = set()
errors = []

for index, row in enumerate(data, start=1):
    if not isinstance(row, dict):
        errors.append(f"Record {index}: not an object")
        continue

    value = row.get("date", "")
    try:
        parsed = date.fromisoformat(value)
        if parsed.isoformat() != value:
            raise ValueError()
    except (ValueError, TypeError):
        errors.append(f"Record {index}: invalid date {value!r}")
        continue

    if value in seen:
        errors.append(f"Record {index}: duplicate date {value}")
    seen.add(value)

    for prayer in required:
        time = row.get(prayer)
        if not isinstance(time, str) or not re.fullmatch(
            r"(?:[01]\d|2[0-3]):[0-5]\d", time
        ):
            errors.append(
                f"Record {index} ({value}): invalid {prayer}={time!r}"
            )

for error in errors:
    print("ERROR:", error)

print(f"Records checked: {len(data)}")
print(f"Unique valid dates: {len(seen)}")
print(f"Errors: {len(errors)}")

if errors:
    raise SystemExit(1)
