import Link from "next/link";

const moduleMap = [
  "Sales / AR",
  "Purchases / AP",
  "Banking & Reconciliation",
  "Inventory Accounting",
  "Payroll",
  "Tax + SST + E-Invoice",
  "Audit Trail + AI Audit",
  "Finance / Treasury",
  "Reporting + Report Builder",
  "AI Command Center + AI CFO"
];

export default function HomePage() {
  return (
    <main className="container grid">
      <section className="card">
        <h1>Good morning — AI Finance OS</h1>
        <p className="muted">
          One shared accounting engine from source document to bookkeeping, accounting, tax,
          audit, finance, reporting, and AI decisions.
        </p>
      </section>

      <section className="grid metrics">
        <div className="card">
          <h3>Revenue</h3>
          <p>RM82.3k</p>
          <span className="muted">↑ 18%</span>
        </div>
        <div className="card">
          <h3>Expenses</h3>
          <p>RM51.2k</p>
          <span className="muted">↑ 12%</span>
        </div>
        <div className="card">
          <h3>Profit</h3>
          <p>RM31.1k</p>
          <span className="muted">↑ 24%</span>
        </div>
        <div className="card">
          <h3>Cash</h3>
          <p>RM128.4k</p>
          <span className="muted">↑ 8%</span>
        </div>
      </section>

      <section className="card">
        <h2>Quick Actions</h2>
        <div className="links">
          <Link href="/setup">→ Create company &amp; roles</Link>
          <Link href="/coa">→ Manage chart of accounts</Link>
          <Link href="/sales">→ Sales / AR invoices &amp; receipts</Link>
          <Link href="/purchases">→ Purchases / AP bills &amp; payments</Link>
          <Link href="/banking">→ Bank import &amp; reconciliation</Link>
          <Link href="/month-end">→ Month-end closing checklist</Link>
        </div>
      </section>

      <section className="card">
        <h2>Platform Modules</h2>
        <ul>
          {moduleMap.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Core APIs</h2>
        <ul>
          <li><code>POST /api/companies</code> — create company with COA, roles, period</li>
          <li><code>GET/POST /api/companies/[id]/accounts</code> — chart of accounts</li>
          <li><code>GET /api/companies/[id]/roles</code> — roles &amp; permissions</li>
          <li><code>GET/PATCH /api/companies/[id]/month-end</code> — closing checklist</li>
          <li><code>POST /api/journals/post</code> — deterministic posting</li>
          <li><code>POST /api/ai/bookkeeping/extract</code> — AI document extraction</li>
        </ul>
      </section>
    </main>
  );
}
