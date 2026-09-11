# Sample documents for client upload testing

Folder: `samples/` (next to the project)

## How to try
1. Open the app → login `client@demo.my` / `demo1234`
2. Go to **Upload all**
3. Dump any mix of these files (no need to pick category — AI sorts)
4. Check **Numbers breakdown** and **Download Excel**

## Best for AI vision (images / PDF)

| File | Format | Expected |
|------|--------|----------|
| `01-grab-receipt.png` | PNG | Grab ~RM22.68 |
| `02-office-supplies-bill.png` | PNG | Stationery Hub RM265 + SST |
| `03-sales-invoice.png` | PNG | Blue Ocean Cafe SI-2026-031 ~RM2035.20 |
| `04-petrol-receipt.png` | PNG | Petronas RM58.22 |
| `05-payroll-summary.png` | PNG | May payroll ~RM13755 |
| `07-digi-mobile-bill.jpg` | JPG | Digi bill RM109.18 |
| `08-hotel-tax-invoice.webp` | WEBP | Park Avenue Hotel RM904.82 |
| `09-shopee-office-order.jpg` | JPG | Shopee office order RM150.40 |
| `10-tnb-electricity-bill.pdf` | PDF | TNB bill RM189.10 |
| `11-consulting-sales-invoice.pdf` | PDF | Sales SI-2026-088 RM3922.00 |
| `20-maxis-fibre-bill.gif` | GIF | Maxis fibre RM136.74 |

## Bank / spreadsheet / text formats

| File | Format | Notes |
|------|--------|-------|
| `06-maybank-statement.csv` | CSV (comma) | Classic bank CSV |
| `18-public-bank-statement.csv` | CSV (semicolon) | EU-style `;` delimiter |
| `19-hlb-statement.tsv` | TSV (tab) | Tab-separated movements |
| `12-payroll-payslip-may.txt` | TXT | Payslip text |
| `13-cimb-bank-movements.txt` | TXT | Bank movement dump |
| `14-lazada-stationery-invoice.html` | HTML | Open in browser / print |
| `15-foodpanda-receipt.json` | JSON | Structured receipt |
| `16-expense-sales-register.xlsx` | Excel | Multi-row register + Summary sheet |
| `17-cimb-statement.xlsx` | Excel | Debit/credit statement |

## Tips
- **PNG / JPG / WEBP / PDF / GIF** work best with live OpenRouter vision extract.
- **CSV / TSV / TXT / XLSX / JSON / HTML** are good for “dump everything” flows; AI may lean more on filename + text than full OCR.
- Mix formats in one upload batch to stress-test sorting + Excel export.
- After uploads, use **I've submitted all documents** on the checklist when ready.

Regenerate image/PDF extras: `python samples/_generate_more.py`
