# Outreach Master Web

A modern, minimalist personal outreach engine and AI lead research system. Built with **FastAPI**, **React + Vite + Tailwind CSS**, **Google Places API**, **Gemini**, and **Meta WhatsApp Business Cloud API**.

---

## Key Capabilities

1. **AI Lead Research Agent (Gemini + Google Places API)**
   - Ask natural language questions like:
     > *"Find me 10 food points in York that does not have a website and do have a phone number not landline"*
   - Queries Google Places API for businesses in the specified area.
   - Strictly validates phone numbers using Google's `phonenumbers` (libphonenumber): keeps verified mobile lines (e.g. UK `07...` / `+44 7...`), rejecting geographic landlines (e.g. York area code `01904...`).
   - Verifies the business has no active website.
   - Interactive lead cards with 1-click **Add to Pipeline** and **Import All** actions.

2. **WhatsApp Business Cloud API Messaging Hub**
   - **Pre-Approved Templates**: Required for cold outreach outside the 24-hour customer service window. Select and dispatch outreach templates with dynamic parameter substitution.
   - **Active 24h Customer Service Window**: Freeform two-way messaging unlocks automatically once a customer replies, with a live countdown timer.
   - **Status & Delivery Tracking**: Delivery status ticks (Sent `✓`, Delivered `✓✓`, Read `✓✓` blue, Failed).
   - **Meta Webhook Listener**: Endpoint at `/api/whatsapp/webhook` with `GET` challenge verification and `POST` inbound message ingestion.

3. **Built-in WhatsApp Offline Simulator**
   - Test your entire messaging funnel locally without waiting for Meta approvals or setting up ngrok tunnels.
   - Simulate an incoming customer WhatsApp reply with custom text.
   - Simulate message read receipts with one click.
   - Watch the lead status automatically transition to **Ongoing** in real-time.

4. **Pipeline Dashboard & CRM**
   - Real-time KPIs: **Total Leads**, **Outreach Sent**, **Ongoing Conversations** (replied), and **Finalized Deals**.
   - Calculated Response & Conversion Rate with visual progress funnel.
   - Complete CRM table with filters, search, status transitions, and quick messaging jump.

5. **Modern Minimalist UI/UX**
   - Linear & Raycast inspired dark minimalist aesthetic.
   - Inter font, razor-thin zinc borders, subtle status dots, and distraction-free two-pane messaging layout.

6. **Authentication & Security**
   - JWT authentication with secure password hashing (`bcrypt`).
   - Default seeded credentials: `admin@outreachmaster.com` / `admin123`.

---

## Quick Start

### 1. Launch with the One-Click Script
```bash
cd "Outreach Master Web"
./start.sh
```
This starts both the FastAPI backend on `http://127.0.0.1:8000` and Vite frontend on `http://localhost:5173`.

### 2. Manual Startup

**Backend:**
```bash
cd "Outreach Master Web/backend"
./venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Frontend:**
```bash
cd "Outreach Master Web/frontend"
npm run dev
```

---

## Configuration & API Keys

Configure your keys in `backend/.env` or directly in the UI under **Settings**:

| Key | Description | Default / Example |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API Key | `AIzaSy...` (Smart fallback active if empty) |
| `GOOGLE_MAPS_API_KEY` | Google Cloud Places API Key | `AIzaSy...` (Curated York demo data active if empty) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Phone Number ID | From Meta for Developers |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta WABA ID | From Meta for Developers |
| `WHATSAPP_ACCESS_TOKEN` | System User Permanent Token | `EAAG...` |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification secret | `outreach_master_verify_token` |
| `WHATSAPP_MOCK_MODE` | Toggle offline simulator | `True` / `False` |

---

## Running Automated Tests

Run the full backend test suite covering phone classification, places filtering, JWT auth, lead search, and WhatsApp message lifecycles:

```bash
cd "Outreach Master Web/backend"
./venv/bin/pytest -v tests/
```
