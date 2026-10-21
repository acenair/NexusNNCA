#!/usr/bin/env python3
"""One-time import: firm's client master xlsx -> ca_ai.clients collection.

Run INSIDE the backend container:
    docker cp Our\ client\ list\ for\ CRM.xlsx nnca-backend-1:/tmp/clients.xlsx
    docker exec nnca-backend-1 python scripts/import_clients_xlsx.py /tmp/clients.xlsx

Idempotent: upserts by (legal name lowercased). Existing client records with the
same name are updated with xlsx data; new ones are inserted. Seeded demo clients
are left untouched unless names collide.
"""
import sys
import re
import uuid
from datetime import datetime, timezone

import openpyxl
from pymongo import MongoClient
import os

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://mongo:27017")
DB_NAME = os.environ.get("DB_NAME", "ca_ai")


def iso(v):
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    return str(v).strip()


def yn(v):
    if v is None:
        return None
    s = str(v).strip().lower()
    if s in ("yes", "y", "true", "1"):
        return True
    if s in ("no", "n", "false", "0"):
        return False
    return None


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "").replace("AED", "").strip())
    except ValueError:
        return None


def main(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Client list"]
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=10)
    db = client[DB_NAME]

    inserted = updated = skipped = 0
    for row in ws.iter_rows(min_row=3, values_only=True):
        if not row or not row[1]:
            continue
        (cid, legal, trade, emirate, jurisdiction, free_zone, lic_authority,
         industry, lic_no, lic_type, lic_expiry, vat_reg, vat_trn, ct_reg,
         fye, service_type, audit_purpose, audit_period, prev_auditor,
         amount, workdone_by, *rest) = (list(row) + [None] * 26)[:26]

        legal = str(legal).strip()
        if not legal or legal.lower() in ("legal name", "client name"):
            continue
        # skip formula artifacts
        if str(trade or "").startswith("="):
            trade = None

        doc = {
            "name": legal,
            "trade_name": iso(trade),
            "entity_type": str(jurisdiction or "").strip() or "LLC",
            "emirate": iso(emirate),
            "jurisdiction": iso(jurisdiction),
            "free_zone": iso(free_zone),
            "licensing_authority": iso(lic_authority),
            "industry": iso(industry),
            "trade_licence_no": iso(lic_no),
            "license_type": iso(lic_type),
            "license_expiry": iso(lic_expiry),
            "vat_registered": yn(vat_reg),
            "trn": iso(vat_trn) if vat_trn and not str(vat_trn).startswith("=") else None,
            "ct_registered": yn(ct_reg),
            "financial_year_end": iso(fye),
            "service_type": iso(service_type),
            "audit_purpose": iso(audit_purpose),
            "audit_period": iso(audit_period),
            "previous_auditor": iso(prev_auditor),
            "fee_amount": num(amount),
            "workdone_by": iso(workdone_by),
            "status": "Active",
            "source": "xlsx_import_2026_10",
        }

        res = db.clients.update_one(
            {"name": {"$regex": f"^{re.escape(legal)}$", "$options": "i"}},
            {"$set": doc, "$setOnInsert": {
                "client_id": f"client_{uuid.uuid4().hex[:12]}",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "active_services": ([doc["service_type"]] if doc["service_type"] else []),
                "aml_risk_rating": "Low",
                "pep_flag": False,
            }},
            upsert=True,
        )
        if res.upserted_id:
            inserted += 1
        elif res.modified_count:
            updated += 1
        else:
            skipped += 1

    total = db.clients.count_documents({})
    print(f"imported: inserted={inserted} updated={updated} unchanged={skipped}")
    print(f"clients collection total: {total}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/clients.xlsx")
