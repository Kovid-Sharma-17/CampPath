"""AccessPath admin: a small form/CSV workflow for updating status.csv-shaped
accessibility and closure reports without hand-editing JSON or JavaScript.

Run locally (SQLite, zero setup):
    pip install flask
    python3 server/app.py
    open http://127.0.0.1:5050

Point at a real Postgres / Tiger Data instance instead:
    pip install flask psycopg2-binary
    DATABASE_URL=postgresql://user:pass@host:port/db python3 server/app.py

This intentionally stays a *separate* tool from the static dist/ app rather
than making the pilot depend on a live server. Use "Export" below to produce
a status-records.json (or status.csv) you can review and drop into
dist/data/, the same way the imported dataset already works.

Vocabulary below must stay in sync with dist/router.mjs and
source-data/DATA_MODEL.md - it is not this app's to invent.
"""
from __future__ import annotations
import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, request, Response, render_template_string

from db import Database

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dist" / "data"

OPERATIONAL_STATUS = {"available", "closed", "unknown"}
ACCESSIBILITY_STATUS = {"step_free", "stairs", "limited", "unknown"}
CONFIDENCE = {"official", "field_verified", "community_report", "inferred"}
STATUS_FIELDS = {"operational_status", "accessibility_status"}

app = Flask(__name__)
db = Database()


def known_asset_ids() -> set[str]:
    """Real asset ids from the imported pilot data, so the admin tool can
    flag a typo'd or made-up asset_id instead of silently accepting it."""
    ids: set[str] = set()
    try:
        entrances = json.loads((DATA_DIR / "entrances.geojson").read_text())
        ids |= {f["properties"]["entrance_id"] for f in entrances["features"]}
        paths = json.loads((DATA_DIR / "paths.geojson").read_text())
        ids |= {f["properties"]["segment_id"] for f in paths["features"]}
        connectors = json.loads((DATA_DIR / "connectors.geojson").read_text())
        ids |= {f["properties"]["connector_id"] for f in connectors["features"]}
    except FileNotFoundError:
        pass  # admin tool still works; every asset_id is just reported as unrecognized
    return ids


KNOWN_ASSETS = known_asset_ids()


def parse_iso(value: str) -> bool:
    if not value:
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def validate_row(row: dict) -> tuple[list[str], dict]:
    """Mirrors the disambiguation router.mjs already does for status.csv's
    dual-vocabulary `status` column (see DATA_MODEL.md's status.csv note)."""
    errors = []
    asset_id = (row.get("asset_id") or "").strip()
    if not asset_id:
        errors.append("asset_id is required")
    status = (row.get("status") or "").strip()
    status_field = (row.get("status_field") or "").strip()
    if status_field and status_field not in STATUS_FIELDS:
        errors.append(f'status_field "{status_field}" must be operational_status or accessibility_status')
    if not status_field:
        if status in OPERATIONAL_STATUS:
            status_field = "operational_status"
        elif status in ACCESSIBILITY_STATUS:
            status_field = "accessibility_status"
        else:
            errors.append(f'status "{status}" does not match either vocabulary; set status_field explicitly')
    elif status_field == "operational_status" and status not in OPERATIONAL_STATUS:
        errors.append(f'status "{status}" is not valid for operational_status: {sorted(OPERATIONAL_STATUS)}')
    elif status_field == "accessibility_status" and status not in ACCESSIBILITY_STATUS:
        errors.append(f'status "{status}" is not valid for accessibility_status: {sorted(ACCESSIBILITY_STATUS)}')
    confidence = (row.get("confidence") or "inferred").strip()
    if confidence not in CONFIDENCE:
        errors.append(f'confidence "{confidence}" must be one of {sorted(CONFIDENCE)}')
    reported_at = (row.get("reported_at") or "").strip()
    if not parse_iso(reported_at):
        errors.append("reported_at must be an ISO 8601 timestamp, e.g. 2026-09-19T14:00:00-04:00")
    expected_end = (row.get("expected_end") or "").strip()
    if expected_end and not parse_iso(expected_end):
        errors.append("expected_end must be an ISO 8601 timestamp or left blank")
    clean = {
        "asset_id": asset_id,
        "status_field": status_field or "",
        "status": status,
        "reason": (row.get("reason") or "").strip(),
        "reported_at": reported_at,
        "expected_end": expected_end,
        "source": (row.get("source") or "").strip(),
        "confidence": confidence,
    }
    return errors, clean


def insert_report(clean: dict) -> None:
    db.insert("status_reports", {
        **clean,
        "known_asset": 1 if clean["asset_id"] in KNOWN_ASSETS else 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def all_reports() -> list[dict]:
    rows = db.query("SELECT * FROM status_reports ORDER BY id DESC")
    for r in rows:
        r["known_asset"] = bool(r["known_asset"])
    return rows


PAGE = """
<!doctype html><html><head><meta charset="utf-8">
<title>AccessPath admin</title>
<style>
body{font:15px/1.5 -apple-system,sans-serif;max-width:960px;margin:0 auto;padding:28px 20px;color:#193c37;background:#f6f8f7}
h1{font-size:22px}h2{font-size:16px;margin-top:36px}
.notice{background:#fff8e9;border:1px solid #ecddb9;padding:14px;border-radius:8px;font-size:13px;color:#81612c}
form{background:white;border:1px solid #e1e8e4;border-radius:10px;padding:18px;margin-top:14px}
label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px}
input,select,textarea{width:100%;padding:8px;border:1px solid #dce6df;border-radius:6px;font:inherit;box-sizing:border-box}
button{margin-top:16px;background:#166c56;color:white;border:0;padding:9px 16px;border-radius:6px;font:inherit;cursor:pointer}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px;background:white}
th,td{text-align:left;padding:8px;border-bottom:1px solid #e1e8e4}
.warn{color:#a1481c;font-weight:600}
.errors{background:#fdeceb;border:1px solid #f1c4bd;padding:10px;border-radius:6px;color:#8a2f1f;font-size:13px;margin-top:10px}
.pill{display:inline-block;padding:1px 8px;border-radius:20px;background:#eaf5ee;font-size:11px}
a{color:#166c56}
</style></head><body>
<h1>AccessPath admin</h1>
<p class="notice">This writes to {{ 'a Postgres database (Tiger Data-compatible)' if is_postgres else 'a local SQLite file (server/accesspath.db)' }}, not the live pilot. Nothing here changes <code>dist/data/</code> until you use Export below and review the result, the same way the original ZIP import worked.</p>

{% if errors %}<div class="errors"><strong>{{ errors|length }} row(s) rejected:</strong><ul>{% for e in errors %}<li>{{ e }}</li>{% endfor %}</ul></div>{% endif %}
{% if added %}<div class="notice">Added {{ added }} report(s).</div>{% endif %}

<h2>Add one report</h2>
<form method="post" action="/submit">
  <label for="asset_id">Asset ID</label>
  <input id="asset_id" name="asset_id" placeholder="e.g. VT-BURRUSS-ELEV-1 or IND-DERRING-1" required>
  <label for="status_field">Which field changed</label>
  <select id="status_field" name="status_field">
    <option value="">Infer from status (matches the app's own loader)</option>
    <option value="operational_status">operational_status (available / closed / unknown)</option>
    <option value="accessibility_status">accessibility_status (step_free / stairs / limited / unknown)</option>
  </select>
  <label for="status">Status value</label>
  <input id="status" name="status" placeholder="e.g. closed, step_free, available" required>
  <label for="confidence">Confidence</label>
  <select id="confidence" name="confidence">
    <option value="inferred">inferred (default - treat as no data)</option>
    <option value="community_report">community_report</option>
    <option value="field_verified">field_verified</option>
    <option value="official">official</option>
  </select>
  <label for="reason">Reason</label>
  <input id="reason" name="reason" placeholder="e.g. Maintenance, Facilities ticket #, survey note">
  <label for="source">Source</label>
  <input id="source" name="source" placeholder="e.g. Facilities, your name, AccessPath survey">
  <label for="reported_at">Reported at (ISO 8601)</label>
  <input id="reported_at" name="reported_at" placeholder="2026-09-19T14:00:00-04:00" required>
  <label for="expected_end">Expected end (optional, ISO 8601)</label>
  <input id="expected_end" name="expected_end" placeholder="leave blank if unknown or permanent">
  <button type="submit">Add report</button>
</form>

<h2>Bulk import CSV</h2>
<p>Same columns as <code>source-data/status.csv</code>: <code>asset_id,status,reason,reported_at,expected_end,source,confidence</code>, plus an optional <code>status_field</code> column.</p>
<form method="post" action="/import" enctype="multipart/form-data">
  <input type="file" name="file" accept=".csv" required>
  <button type="submit">Import CSV</button>
</form>

<h2>Export</h2>
<p><a href="/export.json">status-records.json</a> (drop-in replacement for <code>dist/data/status-records.json</code>) &middot; <a href="/export.csv">status.csv</a></p>

<h2>Recent reports ({{ reports|length }})</h2>
<table>
<tr><th>Asset</th><th>Field</th><th>Status</th><th>Confidence</th><th>Reported</th><th>Source</th></tr>
{% for r in reports %}
<tr>
  <td>{{ r.asset_id }}{% if not r.known_asset %} <span class="warn" title="Not found in the imported entrances, paths or connectors">&#9888; unrecognized</span>{% endif %}</td>
  <td><span class="pill">{{ r.status_field }}</span></td>
  <td>{{ r.status }}</td>
  <td>{{ r.confidence }}</td>
  <td>{{ r.reported_at }}</td>
  <td>{{ r.source }}</td>
</tr>
{% endfor %}
</table>
</body></html>
"""


@app.get("/")
def index():
    return render_template_string(PAGE, reports=all_reports(), errors=[], added=0, is_postgres=db.is_postgres)


@app.post("/submit")
def submit():
    errors, clean = validate_row(request.form.to_dict())
    added = 0
    if not errors:
        insert_report(clean)
        added = 1
    return render_template_string(PAGE, reports=all_reports(), errors=errors, added=added, is_postgres=db.is_postgres)


@app.post("/import")
def bulk_import():
    file = request.files.get("file")
    errors, added = [], 0
    if not file:
        errors = ["No file uploaded"]
    else:
        text = file.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        for i, row in enumerate(reader, start=2):  # header is row 1
            row_errors, clean = validate_row(row)
            if row_errors:
                errors.append(f"Row {i} ({row.get('asset_id', '?')}): " + "; ".join(row_errors))
            else:
                insert_report(clean)
                added += 1
    return render_template_string(PAGE, reports=all_reports(), errors=errors, added=added, is_postgres=db.is_postgres)


@app.get("/export.json")
def export_json():
    records = [{
        "asset_id": r["asset_id"], "status": r["status"], "reason": r["reason"],
        "reported_at": r["reported_at"], "expected_end": r["expected_end"],
        "source": r["source"], "confidence": r["confidence"], "status_field": r["status_field"],
    } for r in all_reports()]
    return Response(json.dumps(records, indent=2) + "\n", mimetype="application/json")


@app.get("/export.csv")
def export_csv():
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["asset_id", "status", "reason", "reported_at", "expected_end", "source", "confidence", "status_field"])
    writer.writeheader()
    for r in all_reports():
        writer.writerow({k: r[k] for k in writer.fieldnames})
    return Response(buf.getvalue(), mimetype="text/csv")


if __name__ == "__main__":
    app.run(port=5050, debug=True)
