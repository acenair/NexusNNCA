"""E-invoicing (UAE) readiness tracker — per-client compliance state.

UAE eInvoicing (DCTCE / 5-corner, PINT AE): voluntary since 1 Jul 2026;
mandatory 1 Jan 2027 for revenue >= AED 50m (ASP by 30 Oct 2026), 1 Jul 2027
for smaller businesses (ASP by 31 Mar 2027), 1 Oct 2027 for government
entities. NNCA as Corner 1 system: tracks every client's readiness.
"""
from fastapi import APIRouter, Cookie, Header, HTTPException
from typing import Optional

from core import db, get_current_user
from routes.journal import journal_event

router = APIRouter(prefix="/api")

PHASES = {
    "phase1": {"label": "Revenue ≥ AED 50m", "asp_by": "2026-10-30", "go_live": "2027-01-01"},
    "phase2": {"label": "Revenue < AED 50m", "asp_by": "2027-03-31", "go_live": "2027-07-01"},
    "gov": {"label": "Government entity", "asp_by": "2027-03-31", "go_live": "2027-10-01"},
}

# readiness checklist items (PINT AE data + appointment steps)
CHECK_ITEMS = [
    ("tin_confirmed", "TIN confirmed (first 10 digits of TRN)"),
    ("fields_ready", "Invoice data covers the 51 mandatory PINT AE fields"),
    ("asp_appointed", "ASP appointed via EmaraTax (on MoF accredited register)"),
    ("peppol_id", "Peppol participant ID issued (0235 + TIN)"),
    ("tested", "Test invoice exchanged end-to-end with the ASP"),
]


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


async def _partner(user):
    if user.get("role") != "partner":
        raise HTTPException(403, "Partners only")
    return user


def _phase_of(rec):
    return rec.get("phase") if rec and rec.get("phase") in PHASES else None


def _decorate(rec):
    """Add phase dates + derived readiness state to a client record."""
    from datetime import date
    phase = _phase_of(rec)
    checks = {k: bool(rec.get(k)) for k, _ in CHECK_ITEMS if k != "label"}
    done = sum(1 for v in checks.values() if v)
    out = {
        **rec,
        "checks": checks,
        "ready_count": f"{done}/{len(checks)}",
        "phase_label": PHASES[phase]["label"] if phase else "— not classified —",
        "asp_by": PHASES[phase]["asp_by"] if phase else None,
        "go_live": PHASES[phase]["go_live"] if phase else None,
    }
    if phase:
        d = date.fromisoformat(PHASES[phase]["asp_by"])
        days = (d - date.today()).days
        out["asp_due_days"] = days
        out["urgency"] = "overdue" if days < 0 and not checks.get("asp_appointed") else (
            "urgent" if days <= 60 and not checks.get("asp_appointed") else "ok")
    return out


@router.get("/einvoicing/overview")
async def overview(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") not in ("partner", "staff", "admin"):
        raise HTTPException(403, "Staff role required")
    recs = {r["client_id"]: r async for r in db.einvoicing_readiness.find({}, {"_id": 0})}
    clients = await db.clients.find({}, {"_id": 0, "client_id": 1, "name": 1, "trn": 1, "status": 1}).to_list(2000)
    out = []
    for c in clients:
        if c.get("status") == "Inactive":
            continue
        out.append(_decorate({**recs.get(c["client_id"], {"client_id": c["client_id"], "client_name": c["name"]}),
                              "client_name": c["name"], "trn": c.get("trn")}))
    out.sort(key=lambda r: (r.get("urgency") != "overdue", r.get("urgency") != "urgent", r.get("client_name", "")))
    return {"clients": out, "phases": PHASES}


@router.patch("/einvoicing/readiness/{client_id}")
async def update_readiness(client_id: str, body: Optional[dict] = None,
                           authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await _partner(await get_current_user(authorization, session_token))
    body = body or {}
    client = await db.clients.find_one({"client_id": client_id})
    if not client:
        raise HTTPException(404, "Client not found")
    allowed = {k for k, _ in CHECK_ITEMS} | {"phase", "asp_name", "asp_notes", "annual_revenue_aed"}
    updates = {k: body[k] for k in allowed if k in body}
    if "phase" in updates and updates["phase"] not in (None, "") and updates["phase"] not in PHASES:
        raise HTTPException(422, "Unknown phase")
    if "annual_revenue_aed" in updates and updates["annual_revenue_aed"] not in (None, ""):
        try:
            updates["annual_revenue_aed"] = float(updates["annual_revenue_aed"])
        except (TypeError, ValueError):
            raise HTTPException(422, "Revenue must be a number")
    if not updates:
        raise HTTPException(422, "Nothing to update")
    updates.update({"client_name": client["name"], "updated_by": user.get("name"), "updated_at": _now()})
    await db.einvoicing_readiness.update_one({"client_id": client_id}, {"$set": updates}, upsert=True)
    return _decorate({**updates, "client_id": client_id})


@router.get("/einvoicing/deadlines")
async def deadlines(authorization: str = Header(None), session_token: str = Cookie(None)):
    await get_current_user(authorization, session_token)
    return {"phases": PHASES,
            "penalties": {
                "not_appointed": "AED 5,000 / month",
                "late_invoice": "AED 100 per invoice (cap AED 5,000 / month)",
                "late_credit_note": "AED 100 per credit note (cap AED 5,000 / month)",
                "data_change_unnotified": "AED 1,000 / day",
            },
            "facts": {
                "format": "PINT AE (UBL 2.1 XML) — 51 mandatory fields for a tax invoice",
                "scope": "B2B / B2G (B2C excluded for now)",
                "participant_id": "0235 + 10-digit TIN",
                "voluntary_since": "2026-07-01",
            }}


# ======================================================================
# Layer 2 — PINT AE (UBL 2.1) e-invoice generation + pre-submission
# validation. The app is Corner 1: it produces structured, validated
# invoice data ready for ANY accredited service provider.
# ======================================================================

EINV_TXN_TYPES = [
    ("standard", "Standard B2B supply"),
    ("free_zone", "Free Zone supply"),
    ("deemed_supply", "Deemed supply"),
    ("margin_scheme", "Margin scheme"),
    ("summary", "Summary invoice"),
    ("continuous", "Continuous supply"),
    ("agent_billing", "Disclosed agent billing"),
    ("ecommerce", "Supply through e-commerce"),
    ("export", "Export"),
]

PINT_PROFILE = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"
PINT_CUSTOMIZATION = "urn:peppol:pint:ae-1"

import hashlib


def _esc(s):
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def _digits(s):
    return "".join(ch for ch in str(s or "") if ch.isdigit())


async def _load_invoice_context(invoice_id):
    """Invoice + client + firm data needed for the e-invoice."""
    inv = await db.invoices.find_one({"invoice_id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    client = await db.clients.find_one({"client_id": inv.get("client_id")}, {"_id": 0}) or {}
    firm = await db.settings.find_one({"type": "firm"}, {"_id": 0}) or {}
    return inv, client, firm


async def _validate_invoice(invoice_id):
    """Field-level PINT AE mandatory-field checks with descriptive issues."""
    inv, client, firm = await _load_invoice_context(invoice_id)
    einv = inv.get("einvoicing") or {}
    issues = []

    def bad(field, msg):
        issues.append({"field": field, "severity": "fail", "message": msg})

    def warn(field, msg):
        issues.append({"field": field, "severity": "warn", "message": msg})

    if not inv.get("invoice_number"):
        bad("invoice_number", "Unique e-invoice number is mandatory")
    if not inv.get("date"):
        bad("issue_date", "Issue date is mandatory")
    if not inv.get("due_date"):
        warn("due_date", "Due date recommended (payment terms)")
    if inv.get("status") == "Draft":
        bad("status", "Draft invoices cannot be transmitted — issue the invoice first")
    if not einv.get("type_code") or einv.get("type_code") not in dict(EINV_TXN_TYPES):
        bad("transaction_type", "Choose the invoice transaction-type code (Free Zone, Deemed supply, Export…)")
    firm_trn = _digits(firm.get("trn"))
    if len(firm_trn) != 15:
        bad("supplier_trn", f"Supplier TRN must be 15 digits (Settings → Firm Identity) — found {len(firm_trn)}")
    if not firm.get("firm_name"):
        bad("supplier_name", "Supplier legal name missing (Settings → Firm Identity)")
    if not (firm.get("address") or "").strip():
        bad("supplier_address", "Supplier address is mandatory (Settings → Firm Identity)")
    if not (firm.get("phone") or firm.get("email")):
        warn("supplier_contact", "Supplier phone or email recommended")
    if not firm.get("bank_details"):
        warn("payment_means", "Bank details recommended for payment (Settings → Firm Identity)")
    if not inv.get("client_name"):
        bad("buyer_name", "Buyer legal name is mandatory")
    buyer_trn = _digits(client.get("trn"))
    if len(buyer_trn) != 15:
        bad("buyer_trn", f"Buyer TRN must be 15 digits — client record has {len(buyer_trn)}")
    if not (einv.get("buyer_address") or client.get("address") or "").strip():
        bad("buyer_address", "Buyer address is mandatory — add it to the client record or the e-invoice fields")
    if not (inv.get("service_name") or "").strip():
        bad("line_item", "Line description (the service) is mandatory")
    if not inv.get("net_amount") and inv.get("net_amount") != 0:
        bad("net_amount", "Net amount required — legacy invoices without a net/VAT split are not e-invoice ready; re-enter with VAT breakdown")
    if inv.get("vat_percent") is None:
        bad("vat_rate", "VAT category/rate is mandatory")
    if inv.get("cancelled"):
        bad("status", "Cancelled invoices cannot be transmitted")

    if client.get("trn") and firm.get("trn") and buyer_trn == firm_trn:
        bad("buyer_trn", "Buyer TRN equals the supplier TRN — check the client record")

    ok = not any(i["severity"] == "fail" for i in issues)
    return {"invoice_id": invoice_id, "valid": ok, "issues": issues,
            "field_count": 51, "checked_groups": 22,
            "einvoicing": einv, "client": client, "firm": firm, "invoice": inv}


@router.get("/einvoicing/invoices/{invoice_id}/validate")
async def validate_invoice(invoice_id: str, authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") not in ("partner", "staff", "admin"):
        raise HTTPException(403, "Staff role required")
    result = await _validate_invoice(invoice_id)
    inv, client, firm, einv = result.pop("invoice"), result.pop("client"), result.pop("firm"), result.pop("einvoicing")
    return result


@router.patch("/einvoicing/invoices/{invoice_id}")
async def update_invoice_einvoicing(invoice_id: str, body: Optional[dict] = None,
                                    authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") not in ("partner", "staff", "admin"):
        raise HTTPException(403, "Staff role required")
    body = body or {}
    inv = await db.invoices.find_one({"invoice_id": invoice_id})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    einv = inv.get("einvoicing") or {}
    if "type_code" in body:
        if body["type_code"] and body["type_code"] not in dict(EINV_TXN_TYPES):
            raise HTTPException(422, "Unknown transaction-type code")
        einv["type_code"] = body["type_code"] or None
    if "buyer_address" in body:
        einv["buyer_address"] = str(body["buyer_address"] or "").strip()[:500] or None
    einv["updated_by"] = user.get("name")
    einv["updated_at"] = _now()
    await db.invoices.update_one({"invoice_id": invoice_id}, {"$set": {"einvoicing": einv}})
    return {"ok": True, "einvoicing": einv}


@router.get("/einvoicing/invoices/{invoice_id}/pintae")
async def generate_pintae(invoice_id: str, download: bool = False,
                          authorization: str = Header(None), session_token: str = Cookie(None)):
    """Generate the PINT AE (UBL 2.1) e-invoice XML and archive it (sha256)."""
    user = await get_current_user(authorization, session_token)
    if user.get("role") not in ("partner", "staff", "admin"):
        raise HTTPException(403, "Staff role required")
    check = await _validate_invoice(invoice_id)
    inv, client, firm = check["invoice"], check["client"], check["firm"]
    einv = inv.get("einvoicing") or {}
    if not check["valid"]:
        raise HTTPException(422, detail={"message": "Invoice is not e-invoice ready — fix the failing fields first",
                                         "issues": check["issues"]})

    def tag(name, val):
        return f"<cbc:{name}>{_esc(val)}</cbc:{name}>" if val not in (None, "", 0) else ""

    net = round(inv.get("net_amount") or 0, 2)
    vat = round(inv.get("vat_amount") or 0, 2)
    gross = round(inv.get("amount") or net + vat, 2)
    vat_pct = inv.get("vat_percent") or 0
    category = "S" if vat_pct > 0 else "Z"  # Standard rated / Zero rated
    firm_trn, buyer_trn = _digits(firm.get("trn")), _digits(client.get("trn"))
    buyer_addr = (einv.get("buyer_address") or client.get("address") or "").strip()
    type_code = einv.get("type_code") or "standard"

    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>{PINT_CUSTOMIZATION}</cbc:CustomizationID>
  <cbc:ProfileID>{PINT_PROFILE}</cbc:ProfileID>
  {tag("ID", inv.get("invoice_number"))}
  {tag("IssueDate", (inv.get("date") or "")[:10])}
  {tag("DueDate", (inv.get("due_date") or "")[:10] if inv.get("due_date") else None)}
  <cbc:InvoiceTypeCode>388</cbc:InvoiceTypeCode>
  {tag("DocumentCurrencyCode", "AED")}
  {tag("TaxCurrencyCode", "AED")}
  <cac:AdditionalDocumentReference>
    <cbc:ID>uae-transaction-type</cbc:ID>
    {tag("DocumentDescription", type_code)}
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      {f'<cbc:EndpointID schemeID="0235">{firm_trn[:10]}</cbc:EndpointID>' if firm_trn else ""}
      <cac:PostalAddress>
        {tag("StreetName", firm.get("address"))}
        <cac:CountrySubentity>{_esc("Dubai")}</cac:CountrySubentity>
        <cac:Country><cbc:IdentificationCode>AE</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        {tag("CompanyID", firm_trn)}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        {tag("RegistrationName", firm.get("firm_name"))}
        {f'<cbc:CompanyID schemeID="TL">{firm_trn}</cbc:CompanyID>' if firm_trn else ""}
      </cac:PartyLegalEntity>
      <cac:Contact>
        {tag("Telephone", firm.get("phone"))}
        {tag("ElectronicMail", firm.get("email"))}
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      {f'<cbc:EndpointID schemeID="0235">{buyer_trn[:10]}</cbc:EndpointID>' if buyer_trn else ""}
      <cac:PostalAddress>
        {tag("StreetName", buyer_addr)}
        <cac:CountrySubentity>{_esc("Dubai")}</cac:CountrySubentity>
        <cac:Country><cbc:IdentificationCode>AE</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        {tag("CompanyID", buyer_trn)}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        {tag("RegistrationName", inv.get("client_name"))}
        {f'<cbc:CompanyID schemeID="TL">{buyer_trn}</cbc:CompanyID>' if buyer_trn else ""}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      {tag("ID", firm.get("bank_details"))}
      {tag("Name", firm.get("firm_name"))}
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    {tag("TaxAmount", f"{vat:.2f}")}
    <cac:TaxSubtotal>
      {tag("TaxableAmount", f"{net:.2f}")}
      {tag("TaxAmount", f"{vat:.2f}")}
      <cac:TaxCategory>
        <cbc:ID>{category}</cbc:ID>
        <cbc:Percent>{vat_pct:g}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    {tag("LineExtensionAmount", f"{net:.2f}")}
    {tag("TaxExclusiveAmount", f"{net:.2f}")}
    {tag("TaxInclusiveAmount", f"{gross:.2f}")}
    {tag("PayableAmount", f"{gross:.2f}")}
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    {tag("ID", "1")}
    <cbc:InvoicedQuantity unitCode="HUR">1</cbc:InvoicedQuantity>
    {tag("LineExtensionAmount", f"{net:.2f}")}
    <cac:Item>
      {tag("Name", inv.get("service_name"))}
    </cac:Item>
    <cac:Price><cbc:PriceAmount>{net:.2f}</cbc:PriceAmount></cac:Price>
    <cac:TaxTotal>
      {tag("TaxAmount", f"{vat:.2f}")}
    </cac:TaxTotal>
    <cac:TaxCategory>
      <cbc:ID>{category}</cbc:ID>
      <cbc:Percent>{vat_pct:g}</cbc:Percent>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:TaxCategory>
  </cac:InvoiceLine>
</Invoice>'''

    sha = hashlib.sha256(xml.encode()).hexdigest()
    from fastapi.responses import Response
    await db.einvoicing_archive.update_one(
        {"invoice_id": invoice_id},
        {"$set": {"invoice_id": invoice_id, "invoice_number": inv.get("invoice_number"),
                  "client_id": inv.get("client_id"), "client_name": inv.get("client_name"),
                  "xml": xml, "sha256": sha, "pint_version": "ae-1",
                  "generated_by": user.get("name") or user.get("email"),
                  "generated_at": _now()}},
        upsert=True)
    if download:
        return Response(content=xml, media_type="application/xml",
                        headers={"Content-Disposition": f'attachment; filename="{inv.get("invoice_number")}-pintae.xml"'})
    return Response(content=xml, media_type="application/xml")


@router.get("/einvoicing/archive")
async def archive_list(authorization: str = Header(None), session_token: str = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if user.get("role") not in ("partner", "staff", "admin"):
        raise HTTPException(403, "Staff role required")
    docs = await db.einvoicing_archive.find(
        {}, {"_id": 0, "xml": 0}).sort("generated_at", -1).to_list(500)
    return {"archived": docs}
