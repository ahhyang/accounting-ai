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
- `OPENROUTER_MODEL` — optional, defaults to `qwen/qwen3-vl-8b-instruct`
- `OPENROUTER_VISION_MODEL` — optional, same Qwen VL model for bill/receipt scanning

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

## Client Portal + Accountant Workspace

### Demo logins
- Client: `client@demo.my` / `demo1234` → `/client`
- Accountant: `accountant@demo.my` / `demo1234` → `/accountant`

### Bulk demo data (multiple clients)
Populate the practice with several SME clients across varied statuses so the
Boss/Manager dashboards look realistic during a demo:

```bash
npm run db:seed        # Demo Company + owner
npm run db:seed:portal # all firm role logins + engagement/billing
npm run db:seed:mock   # mock AR/AP/bank/docs for Demo Company
npm run db:seed:bulk   # 8 more client companies + books + billing
```

Client logins created by the bulk seed (all password `demo1234`):

| Client | Login | Profile |
|--------|-------|---------|
| Alpha Trading | `alpha@demo.my` | Paid, month-end closed, healthy |
| Beta Retail | `beta@demo.my` | Invoiced, duplicate bills |
| Gamma Services | `gamma@demo.my` | Overdue, loss (going concern) |
| Delta Manufacturing | `delta@demo.my` | Onboarding, 6 docs pending |
| Epsilon Logistics | `epsilon@demo.my` | Not billed, SST registered |
| Zeta Foods | `zeta@demo.my` | Paid, overdue AR + duplicate |
| Eta Construction | `eta@demo.my` | On hold, overdue, loss |
| Theta Tech | `theta@demo.my` | Invoiced, near-complete |

Boss (`boss@demo.my`) and Manager (`manager@demo.my`) see all 9 clients with
progress, month-end %, books balanced, and billing (paid / invoiced / overdue).

### Client flow
1. Sign in → monthly checklist with clear instructions
2. Upload bank/sales/purchase/payroll/tax docs
3. AI extracts and proposes journals
4. Track messages if accountant needs a clearer file
5. View simple monthly report when ready

### Accountant flow
1. Sorted inbox (ready / needs manual / waiting on client)
2. Review AI proposal → Approve & Post, Ask client, or Manual post
3. Audit trail of every action
4. Invite client users from `/accountant/clients`

### Env extras
```
NEXTAUTH_URL=https://your-domain.vercel.app
NEXTAUTH_SECRET=long-random-secret
BLOB_READ_WRITE_TOKEN=optional-vercel-blob-token
```
