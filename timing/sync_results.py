"""
sync_results.py

Run this AFTER the race, once person 2 has gone through the Sheet timer.py
synced live and filled in the bib number for each finisher.

What it does:
  1. Opens the same Google Sheet tab timer.py wrote to during the race
     ("{race} - {date}").
  2. Parses each row: place, bib, finish time.
  3. Skips (and reports) any row where bib is still blank -- someone hasn't
     been matched to a finish yet, that's a "go check this" flag, not
     something to silently drop.
  4. Converts the HH:MM:SS.ss finish time back into seconds, since that's
     what the backend stores.
  5. POSTs everything to /api/races/{slug}/results/import in one batch.

Safe to re-run. The backend upserts on (race_id, place), so running this
again after fixing a typo'd bib overwrites that finish position's row in
place instead of creating a duplicate. Re-running is expected, not a special
case -- you'll almost always fix at least one bib after the first pass.

Usage:
  python sync_results.py --race press-expedition-50
  python sync_results.py --race press-expedition-50 --date 2026-08-08
  python sync_results.py --race press-expedition-50 --dry-run
  python sync_results.py --race press-expedition-50 --from-csv results.csv

--race is used as the backend's race slug AND as the Sheet tab prefix it
searches for ("{race} - {date}"). Simplest if you always launch timer.py with
--race set to the same slug the backend uses (e.g. "press-expedition-50", not
"test" or "Press Expedition 50") so there's no separate mapping to keep in
sync by hand.
"""

import argparse
import csv
import datetime as dt
import os
import re
import sys

import gspread
import requests
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

load_dotenv()

API_BASE = os.getenv("SOMMET_API_BASE", "http://localhost:8000")
ADMIN_KEY = os.getenv("SOMMET_ADMIN_KEY", "")

# Same sheet timer.py writes to. Pull this out to a shared config module once
# there's more than one script that needs it -- duplicated in two places is
# fine for now, annoying the moment it needs to change.
SHEET_URL = "https://docs.google.com/spreadsheets/d/1IwSzpPHobzAeeagfZS7gSP9Q1bdnKD4oehv2hSczs4k/edit"

CREDENTIALS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "credentials.json")


def parse_finish_time(raw: str) -> float:
    """'HH:MM:SS.ss' (possibly prefixed with a leading apostrophe, since
    timer.py writes results that way to stop Sheets from mangling it into a
    time-of-day value) -> total seconds as a float (05:01:20.50 -> 18080.50)."""
    cleaned = raw.strip().lstrip("'").strip('"')
    match = re.match(r"^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$", cleaned)
    if not match:
        raise ValueError(f"Unrecognized finish time format: {raw!r}")
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def load_rows_from_sheet(race: str, date: str, credentials_path: str):
    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    if not os.path.exists(credentials_path):
        print(f"Missing Google credentials at: {credentials_path}")
        sys.exit(1)
    creds = Credentials.from_service_account_file(credentials_path, scopes=scopes)
    client = gspread.authorize(creds)
    sh = client.open_by_url(SHEET_URL)

    tab_name = f"{race} - {date}"
    try:
        sheet = sh.worksheet(tab_name)
    except gspread.exceptions.WorksheetNotFound:
        print(f"No tab found called '{tab_name}'. Check --race and --date match what timer.py used.")
        sys.exit(1)

    return _strip_header(sheet.get_all_values())


def _strip_header(rows):
    """Drops the header row only if the first row actually is one (first cell
    'Place'). Sheets/CSVs with no header keep every row, so a finisher sitting
    in row 1 is never silently dropped."""
    if rows and rows[0] and str(rows[0][0]).strip().lower() == "place":
        return rows[1:]
    return rows


def load_rows_from_csv(path: str):
    """Debug/offline path -- lets you test parsing and the API call without
    hitting Google Sheets at all. Expects the same three columns."""
    with open(path, newline="") as f:
        rows = list(csv.reader(f))
    return _strip_header(rows)


def build_payload(rows):
    """Returns (results_ready_to_send, skipped_rows_missing_bib)."""
    results = []
    skipped = []

    for row in rows:
        if len(row) < 3:
            continue
        place_raw, bib_raw, time_raw = row[0], row[1], row[2]

        if not bib_raw.strip():
            skipped.append({"place": place_raw, "time": time_raw})
            continue

        try:
            results.append({
                "bib_number": int(bib_raw.strip()),
                "place": int(place_raw.strip()),
                "finish_time_seconds": parse_finish_time(time_raw),
            })
        except ValueError as e:
            print(f"  Skipping unparseable row {row}: {e}")
            skipped.append({"place": place_raw, "time": time_raw})

    return results, skipped


def push_to_backend(race_slug: str, results: list):
    if not ADMIN_KEY:
        print("SOMMET_ADMIN_KEY is not set (check your .env). Refusing to call the API without it.")
        sys.exit(1)

    resp = requests.post(
        f"{API_BASE}/api/races/{race_slug}/results/import",
        json={"results": results},
        headers={"X-Admin-Key": ADMIN_KEY},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser(description="Sync finish-line results into the Sommet backend.")
    parser.add_argument("--race", required=True, help="Backend slug AND sheet tab prefix, e.g. press-expedition-50.")
    parser.add_argument("--date", default=str(dt.date.today()), help="Defaults to today. Match what timer.py used.")
    parser.add_argument("--from-csv", help="Read rows from a local CSV instead of Google Sheets (for testing).")
    parser.add_argument("--dry-run", action="store_true", help="Parse and print, but don't call the API.")
    args = parser.parse_args()

    print(f"Loading results for '{args.race}' on {args.date}...")
    if args.from_csv:
        rows = load_rows_from_csv(args.from_csv)
    else:
        rows = load_rows_from_sheet(args.race, args.date, CREDENTIALS_PATH)
    print(f"  {len(rows)} row(s) found.")

    results, skipped = build_payload(rows)

    if skipped:
        print(f"\n{len(skipped)} row(s) skipped -- no bib filled in yet:")
        for s in skipped:
            print(f"  place {s['place']} @ {s['time']}")
        print("Fill these in on the sheet and re-run; already-synced rows will just update, not duplicate.\n")

    if not results:
        print("Nothing to send.")
        return

    print(f"Ready to send {len(results)} result(s).")
    if args.dry_run:
        for r in results:
            print(f"  bib {r['bib_number']}: place {r['place']}, {r['finish_time_seconds']}s")
        print("(dry run -- nothing sent)")
        return

    outcome = push_to_backend(args.race, results)
    print(f"\nImported: {outcome['imported']}")
    if outcome["unmatched_bibs"]:
        print(f"Unmatched bibs (no registrant found for these -- check for typos): {outcome['unmatched_bibs']}")
    else:
        print("All bibs matched.")


if __name__ == "__main__":
    main()