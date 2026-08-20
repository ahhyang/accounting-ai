# AI Finance OS (Vercel + Neon + OpenRouter)

Full financial lifecycle platform:

Source Document → Bookkeeping → Accounting → Tax → Audit → Finance → Reporting → AI Decision-Making

## Stack

- **Next.js** (App Router) — Vercel deployment
- **Neon Postgres** — `DATABASE_URL`
- **Prisma** — accounting data model
- **OpenRouter** — AI bookkeeping and analysis

## Design principle

AI proposes actions; a **deterministic accounting engine** posts after human approval.

## What's implemented

### Core engine
- Double-entry posting with debit/credit balance validation
- Period lock checks (blocks posting into closed periods)

### Company setup
- Company profile (name, registration, industry, currency)
- Branches, departments, cost centres, bank accounts, tax settings
- System roles: Owner, Admin, Accountant, Bookkeeper, Finance Manager, Auditor, Tax Agent
- Granular permissions: View, Create, Edit, Delete, Approve, Export, Post, Reverse, Close Period, Manage Users, View Payroll/Tax/Audit

### Chart of accounts
- Default Malaysia COA (Assets, Liabilities, Equity, Revenue, Expenses)
- Custom account creation via API and UI

### Sales / AR
- Customers with outstanding balances
- Sales invoices auto-post: Dr AR / Cr Sales (+ SST if tax)
- Receipts allocate to invoices and clear AR
- AR aging buckets (current / 1-30 / 31-60 / 61-90 / 90+)

### Purchases / AP
- Suppliers, bills, payments
- Bills auto-post: Dr Expense (+ Input Tax) / Cr AP
- Payments clear AP
- AP aging + duplicate bill detection

### Banking & Reconciliation
- Import bank transactions (JSON)
- Auto-match deposits to receipts/invoices and withdrawals to payments/bills
- Summary: matched / suggested / unmatched

### AI
- Bookkeeping document extraction via OpenRouter

## Setup

```bash
npm install
copy .env.example .env
```

Set in `.env`:
- `DATABASE_URL` — Neon connection string
- `OPENROUTER_API_KEY` — your key (never commit this)
- `OPENROUTER_MODEL` — optional, defaults to `openai/gpt-4o-mini`

```bash
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard |
| `/setup` | Create company with defaults |
| `/coa` | Chart of accounts management |
| `/sales` | AR: customers, invoices, receipts, aging |
| `/purchases` | AP: suppliers, bills, payments, duplicates |
| `/banking` | Bank import & reconciliation |
| `/month-end` | Closing checklist |

## API routes

| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/companies` | List / create companies |
| GET/POST | `/api/companies/[id]/accounts` | COA |
| GET | `/api/companies/[id]/roles` | Roles & permissions |
| GET/PATCH | `/api/companies/[id]/month-end` | Closing checklist |
| POST | `/api/journals/post` | Post journal entry |
| POST | `/api/ai/bookkeeping/extract` | AI document extraction |

## Deploy to Vercel

1. Push this repo to GitHub
2. Import project in Vercel
3. Add env vars: `DATABASE_URL`, `OPENROUTER_API_KEY`
4. Deploy — `postinstall` runs `prisma generate` automatically

## Next phases

- AR/AP workflows with auto journal generation
- Bank reconciliation matching
- Inventory, payroll, fixed assets
- Tax/SST and e-Invoice (Malaysia)
- AI audit risk scoring
- AI CFO daily briefing and scenario planning
