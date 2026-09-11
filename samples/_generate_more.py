"""Generate extra sample documents in multiple formats for upload testing."""
from __future__ import annotations

from pathlib import Path

from fpdf import FPDF
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FOOTER = "Sample file for AI Finance OS client upload testing"


def font(size: int, bold: bool = False):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf",
        "C:/Windows/Fonts/consola.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_doc(
    path: Path,
    title: str,
    lines: list[str],
    *,
    size: tuple[int, int] = (520, 720),
    bg: tuple[int, int, int] = (255, 255, 255),
    fmt: str = "PNG",
    quality: int = 92,
):
    img = Image.new("RGB", size, bg)
    draw = ImageDraw.Draw(img)
    title_f = font(22, bold=True)
    body_f = font(15)
    mono_f = font(14)
    small_f = font(11)

    y = 28
    draw.text((28, y), title, fill=(20, 20, 20), font=title_f)
    y += 34
    draw.line((28, y, size[0] - 28, y), fill=(40, 40, 40), width=2)
    y += 18

    for line in lines:
        if line == "---":
            draw.line((28, y + 4, size[0] - 28, y + 4), fill=(160, 160, 160), width=1)
            y += 16
            continue
        if line.startswith("TOTAL") or line.startswith("SUBTOTAL") or line.startswith("TAX"):
            draw.text((28, y), line, fill=(10, 10, 10), font=font(16, bold=True))
        else:
            draw.text((28, y), line, fill=(30, 30, 30), font=mono_f if "RM" in line else body_f)
        y += 26

    draw.text((28, size[1] - 36), FOOTER, fill=(150, 150, 150), font=small_f)
    path.parent.mkdir(parents=True, exist_ok=True)
    save_kw: dict = {}
    if fmt.upper() in {"JPEG", "JPG"}:
        save_kw["quality"] = quality
        save_kw["optimize"] = True
        fmt = "JPEG"
    elif fmt.upper() == "WEBP":
        save_kw["quality"] = quality
    img.save(path, format=fmt, **save_kw)
    print("wrote", path.name, path.stat().st_size)


def make_pdf(path: Path, title: str, body_lines: list[str]):
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, title, ln=True)
    pdf.set_draw_color(40, 40, 40)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(6)
    pdf.set_font("Courier", size=11)
    for line in body_lines:
        if line == "---":
            pdf.ln(2)
            pdf.line(10, pdf.get_y(), 200, pdf.get_y())
            pdf.ln(4)
            continue
        pdf.cell(0, 7, line[:95], ln=True)
    pdf.set_font("Helvetica", size=8)
    pdf.set_text_color(120, 120, 120)
    pdf.ln(8)
    pdf.cell(0, 5, FOOTER, ln=True)
    pdf.output(str(path))
    print("wrote", path.name, path.stat().st_size)


def main():
    # 07 — Digi bill (JPG)
    draw_doc(
        ROOT / "07-digi-mobile-bill.jpg",
        "DIGI POSTPAID BILL",
        [
            "Merchant: Digi Telecommunications",
            "Account: 012-3456789",
            "Doc No: DIGI-202605-88421",
            "Date: 2026-05-18",
            "Due date: 2026-06-05",
            "Payment: Online banking",
            "---",
            "Postpaid Plan 5G        RM 88.00",
            "Roaming add-on          RM 15.00",
            "SST 6%                  RM  6.18",
            "---",
            "SUBTOTAL               RM 103.00",
            "TAX                    RM   6.18",
            "TOTAL                  RM 109.18",
            "Currency: MYR",
            "Category: PURCHASE / Utility",
        ],
        fmt="JPEG",
    )

    # 08 — Hotel tax invoice (WEBP)
    draw_doc(
        ROOT / "08-hotel-tax-invoice.webp",
        "HOTEL TAX INVOICE",
        [
            "Merchant: Park Avenue Hotel KL",
            "Guest / Customer: Demo Trading Sdn Bhd",
            "Doc No: HT-INV-55201",
            "Date: 2026-05-22",
            "Payment: Corporate card",
            "---",
            "Deluxe room x2 nights   RM 680.00",
            "Breakfast package       RM  96.00",
            "Service charge 10%      RM  77.60",
            "SST 6%                  RM  51.22",
            "---",
            "SUBTOTAL               RM 853.60",
            "TAX                    RM  51.22",
            "TOTAL                  RM 904.82",
            "Currency: MYR",
            "Category: PURCHASE / Travel",
        ],
        size=(540, 760),
        fmt="WEBP",
    )

    # 09 — Shopee order (JPG slightly cream bg)
    draw_doc(
        ROOT / "09-shopee-office-order.jpg",
        "SHOPEE ORDER RECEIPT",
        [
            "Merchant: Shopee / OfficeMart MY",
            "Order No: SP-260529-77102",
            "Date: 2026-05-29",
            "Payment: ShopeePay",
            "---",
            "A4 paper ream x5        RM  62.50",
            "Ink cartridge black     RM  89.90",
            "Shipping                RM   8.00",
            "Voucher discount       -RM  10.00",
            "---",
            "SUBTOTAL               RM 150.40",
            "TAX                    RM   0.00",
            "TOTAL                  RM 150.40",
            "Currency: MYR",
            "Category: PURCHASE / Office",
        ],
        bg=(255, 252, 245),
        fmt="JPEG",
    )

    # 10 — TNB electricity PDF
    make_pdf(
        ROOT / "10-tnb-electricity-bill.pdf",
        "TNB ELECTRICITY BILL",
        [
            "Merchant: Tenaga Nasional Berhad",
            "Account: 2200-7788-9911",
            "Doc No: TNB-MAY-2026-4412",
            "Bill date: 2026-05-20",
            "Due date: 2026-06-10",
            "Payment method: FPX / JomPAY",
            "---",
            "Previous reading                 12450 kWh",
            "Current reading                  12610 kWh",
            "Usage                            160 kWh",
            "Energy charge                    RM 175.85",
            "Renewable energy fund            RM   2.55",
            "SST 6%                           RM  10.70",
            "---",
            "SUBTOTAL                         RM 178.40",
            "TAX                              RM  10.70",
            "TOTAL                            RM 189.10",
            "Currency: MYR",
            "Category: PURCHASE / Utility",
        ],
    )

    # 11 — Professional services invoice PDF (sales)
    make_pdf(
        ROOT / "11-consulting-sales-invoice.pdf",
        "TAX INVOICE - CONSULTING",
        [
            "Seller: Demo Trading Sdn Bhd",
            "Customer: Sunrise Retail Sdn Bhd",
            "Doc No: SI-2026-088",
            "Date: 2026-05-25",
            "Due date: 2026-06-24",
            "Payment terms: Net 30",
            "---",
            "Business process review          RM 2,800.00",
            "Staff training (1 day)           RM   900.00",
            "SST 6%                           RM   222.00",
            "---",
            "SUBTOTAL                         RM 3,700.00",
            "TAX                              RM   222.00",
            "TOTAL                            RM 3,922.00",
            "Currency: MYR",
            "Category: SALES",
        ],
    )

    # 12 — Payroll payslip-style TXT
    (ROOT / "12-payroll-payslip-may.txt").write_text(
        "\n".join(
            [
                "PAYROLL PAYSLIP - MAY 2026",
                "========================================",
                "Employer: Demo Trading Sdn Bhd",
                "Employee: Ahmad Faizal Bin Omar",
                "Employee No: EMP-014",
                "Pay period: 2026-05-01 to 2026-05-31",
                "Pay date: 2026-05-28",
                "Doc No: PAY-2026-05-014",
                "----------------------------------------",
                "Basic salary                 RM  4,200.00",
                "Allowances                   RM    350.00",
                "Overtime                     RM    180.00",
                "Gross pay                    RM  4,730.00",
                "----------------------------------------",
                "EPF employee                 RM   -520.00",
                "SOCSO                        RM    -45.50",
                "EIS                          RM     -9.40",
                "PCB / Tax                    RM   -210.00",
                "----------------------------------------",
                "SUBTOTAL (gross)             RM  4,730.00",
                "TAX (PCB)                    RM    210.00",
                "TOTAL NET PAY                RM  3,945.10",
                "Currency: MYR",
                "Category: PAYROLL",
                "",
                FOOTER,
                "",
            ]
        ),
        encoding="utf-8",
    )
    print("wrote 12-payroll-payslip-may.txt")

    # 13 — CIMB statement-like TXT
    (ROOT / "13-cimb-bank-movements.txt").write_text(
        "\n".join(
            [
                "CIMB BUSINESS CURRENT ACCOUNT STATEMENT",
                "Account: 8001-2233-4455",
                "Period: 2026-05-01 to 2026-05-31",
                "Opening balance: RM 12,880.40",
                "----------------------------------------",
                "2026-05-04  DIGI BILL DIGI-202605-88421     -109.18",
                "2026-05-10  SUNRISE RETAIL SI-2026-088      3922.00",
                "2026-05-18  SHOPEE OFFICEMART SP-260529     -150.40",
                "2026-05-20  TNB ELECTRICITY TNB-MAY-4412    -189.10",
                "2026-05-22  PARK AVENUE HOTEL HT-INV-55201  -904.82",
                "2026-05-28  PAYROLL NET PAY MAY             -3945.10",
                "----------------------------------------",
                "Closing balance: RM 11,503.80",
                "Currency: MYR",
                "Category: BANK",
                "",
                FOOTER,
                "",
            ]
        ),
        encoding="utf-8",
    )
    print("wrote 13-cimb-bank-movements.txt")

    # 14 — HTML invoice (browser "Print to PDF" friendly)
    (ROOT / "14-lazada-stationery-invoice.html").write_text(
        """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Lazada Tax Invoice LZ-260530-991</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 640px; margin: 32px auto; color: #111; }
    h1 { font-size: 22px; border-bottom: 2px solid #222; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid #ddd; }
    .right { text-align: right; }
    .totals td { font-weight: bold; }
    footer { margin-top: 28px; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <h1>LAZADA TAX INVOICE</h1>
  <p>
    Merchant: Lazada / PaperPlus Stationery<br/>
    Customer: Demo Trading Sdn Bhd<br/>
    Doc No: LZ-260530-991<br/>
    Date: 2026-05-30<br/>
    Payment: Credit card<br/>
    Currency: MYR · Category: PURCHASE
  </p>
  <table>
    <thead>
      <tr><th>Description</th><th class="right">Amount (RM)</th></tr>
    </thead>
    <tbody>
      <tr><td>Folder plastic A4 x20</td><td class="right">45.00</td></tr>
      <tr><td>Marker set x3</td><td class="right">27.90</td></tr>
      <tr><td>Shipping</td><td class="right">6.50</td></tr>
      <tr><td>SST 6%</td><td class="right">4.76</td></tr>
      <tr class="totals"><td>SUBTOTAL</td><td class="right">79.40</td></tr>
      <tr class="totals"><td>TAX</td><td class="right">4.76</td></tr>
      <tr class="totals"><td>TOTAL</td><td class="right">84.16</td></tr>
    </tbody>
  </table>
  <footer>Sample file for AI Finance OS client upload testing</footer>
</body>
</html>
""",
        encoding="utf-8",
    )
    print("wrote 14-lazada-stationery-invoice.html")

    # 15 — JSON extraction-style sample
    (ROOT / "15-foodpanda-receipt.json").write_text(
        """{
  "merchant": "Foodpanda / Restoran Ipoh White Coffee",
  "supplier": "Foodpanda Malaysia",
  "customer": null,
  "documentNumber": "FP-7788123",
  "date": "2026-05-14",
  "dueDate": null,
  "subtotal": 31.40,
  "tax": 1.88,
  "total": 33.28,
  "currency": "MYR",
  "paymentMethod": "Touch n Go eWallet",
  "categoryHint": "PURCHASE",
  "lineItems": [
    { "description": "White coffee set", "quantity": 2, "unitPrice": 9.90, "amount": 19.80 },
    { "description": "Kaya toast", "quantity": 1, "unitPrice": 6.50, "amount": 6.50 },
    { "description": "Delivery fee", "quantity": 1, "unitPrice": 5.10, "amount": 5.10 },
    { "description": "SST 6%", "quantity": 1, "unitPrice": 1.88, "amount": 1.88 }
  ],
  "notes": "Sample JSON receipt for AI Finance OS upload testing"
}
""",
        encoding="utf-8",
    )
    print("wrote 15-foodpanda-receipt.json")


if __name__ == "__main__":
    main()
