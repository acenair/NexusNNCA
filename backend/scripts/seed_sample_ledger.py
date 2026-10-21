#!/usr/bin/env python3
"""Seed a meaningful sample billing ledger for the Auditflow billing workspace.

Uses the firm's REAL imported clients and their real fee amounts from the
client-master sheet, generating a realistic 5-month invoice ledger (Jun-Oct):
paid, part-paid, unpaid, overdue, credit notes and one cancelled invoice,
with dated receipts (bank transfer / cheque / cash).

Run INSIDE the backend container:
    docker exec nnca-backend-1 python scripts/seed_sample_ledger.py

Idempotent: wipes only documents marked source='sample_ledger' before seeding.
"""
import random
import uuid
from datetime import datetime, timedelta, timezone

from pymongo import MongoClient
import os

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://mongo:27017")
DB_NAME = os.environ.get("DB_NAME", "ca_ai")
random.seed(42)


def main():
    db = MongoClient(MONGO_URL, serverSelectionTimeoutMS=10)[DB_NAME]
    db.invoices.delete_many({"source": "sample_ledger"})

    # real clients with real fees from the sheet
    clients = list(db.clients.find(
        {"source": "xlsx_import_2026_10", "fee_amount": {"$gt": 0}},
        {"_id": 0, "client_id": 1, "name": 1, "fee_amount": 1, "service_type": 1, "workdone_by": 1}))
    if len(clients) < 10:
        print("need at least 10 imported clients with fees; found", len(clients))
        return
    clients.sort(key=lambda c: c["name"])
    chosen = clients[:26]

    today = datetime.now(timezone.utc).date()
    year = today.year
    months = [(10, [1, 2, 3, 4, 5, 6]), (9, [2, 5, 9, 12, 18]), (8, [4, 11, 20, 25]), (7, [3, 14, 22]), (6, [8, 19])]
    plan = []  # (client, (m, d))
    for m, days in months:
        for d in days:
            if plan:
                pass
            if len(plan) < len(chosen):
                plan.append((chosen[len(plan)], (m, d)))
    plan = plan[:26]

    staff_pool = sorted({c.get("workdone_by") or "Admin" for c in chosen})
    services = {"statutory_audit": "External Audit", "corporate_tax": "Corporate Tax",
                "vat_filing": "VAT Filing", "aml_review": "AML Review", "accounting": "Accounting"}
    methods = ["Bank transfer", "Cheque cleared", "Cash", "Bank transfer", "Bank transfer"]

    seq = 0
    inserted = 0
    for idx, (client, (m, d)) in enumerate(plan):
        inv_date = today.replace(month=m, day=min(d, 28))
        if m == 10 and d > today.day:  # future dates only within current month
            inv_date = today.replace(day=max(1, d - 2))
        due_date = inv_date + timedelta(days=15)
        fee = float(client.get("fee_amount") or 1000)
        amount = fee if fee >= 500 else fee * 2  # keep meaningful ticket sizes
        seq += 1
        inv_number = f"INV-{year}-{seq:03d}"
        # deterministic mix across the ledger
        state = ["paid", "paid", "part", "unpaid", "overdue", "part", "paid", "unpaid",
                 "credit", "paid", "overdue", "part", "unpaid", "paid"][idx % 14]
        if idx == len(plan) - 1:
            state = "cancelled"

        receipts, credits, paid = [], [], 0.0
        if state == "paid":
            n = random.choice([1, 1, 2])
            for k in range(n):
                amt = round(amount / n, 2) if k < n - 1 else round(amount - paid, 2)
                rdate = inv_date + timedelta(days=random.randint(3, 12))
                if rdate > today: rdate = today
                receipts.append({"receipt_id": f"RCT-{uuid.uuid4().hex[:8].upper()}", "amount": amt,
                                 "method": random.choice(methods), "reference": f"TRF-{random.randint(1000,9999)}",
                                 "date": rdate.isoformat(), "recorded_by": client.get("workdone_by") or "Admin",
                                 "recorded_at": datetime.now(timezone.utc).isoformat()})
                paid += amt
        elif state == "part":
            amt = round(amount * random.choice([0.4, 0.5, 0.6]), 2)
            rdate = inv_date + timedelta(days=random.randint(2, 8))
            if rdate > today: rdate = today
            receipts.append({"receipt_id": f"RCT-{uuid.uuid4().hex[:8].upper()}", "amount": amt,
                             "method": random.choice(methods), "reference": f"TRF-{random.randint(1000,9999)}",
                             "date": rdate.isoformat(), "recorded_by": "Admin",
                             "recorded_at": datetime.now(timezone.utc).isoformat()})
            paid = amt
        elif state == "credit":
            credits.append({"credit_id": f"CN-{uuid.uuid4().hex[:8].upper()}", "amount": 500.0,
                            "reason": "agreed fee adjustment", "date": (due_date - timedelta(days=2)).isoformat(),
                            "created_by": "Admin"})

        status = "Paid" if paid >= amount - 0.009 else "Unpaid"
        doc = {
            "invoice_id": f"inv_{uuid.uuid4().hex[:12]}",
            "invoice_number": inv_number,
            "client_id": client["client_id"], "client_name": client["name"],
            "service_name": services.get(client.get("service_type") or "", client.get("service_type") or "Accounting"),
            "amount": amount, "date": inv_date.isoformat(), "due_date": due_date.isoformat(),
            "status": status, "staff": client.get("workdone_by") or "Admin",
            "amount_paid": round(paid, 2), "receipts": receipts, "credits": credits,
            "cancelled": state == "cancelled",
            "cancel_reason": "engagement withdrawn" if state == "cancelled" else None,
            "source": "sample_ledger",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        db.invoices.insert_one(doc)
        inserted += 1

    total = db.invoices.count_documents({})
    print(f"seeded {inserted} sample invoices; collection total {total}")


if __name__ == "__main__":
    main()
