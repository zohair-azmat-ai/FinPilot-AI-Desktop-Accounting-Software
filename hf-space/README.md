---
title: FinPilot AI Backend
emoji: 📊
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
license: mit
---

# FinPilot AI Cloud Backend

Cloud PDF generation backend for FinPilot AI accounting software.

## Endpoints

- `GET /health` — health check
- `GET /api/invoices/{lookup}/pdf` — invoice PDF (lookup = invoice_number, sync_uuid, or id)
- `GET /api/quotations/{lookup}/pdf` — quotation PDF
- `GET /api/delivery-notes/{lookup}/pdf` — delivery note PDF
- `GET /api/purchase-orders/{lookup}/pdf` — purchase order PDF
- `GET /api/cloud/debug/invoice-sync/{invoice_number}` — sync debug

All endpoints accept an optional `workspace_id` query param to override the default.

## Environment Variables

Set these in the Space settings → Variables and Secrets:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (https://xxxx.supabase.co) |
| `SUPABASE_KEY` | Supabase anon or service role key |
| `DEFAULT_WORKSPACE_ID` | Default workspace ID for your installation |
