import Link from "next/link";

const demos = [
  { role: "Client", email: "client@demo.my", blurb: "Upload & scan bills" },
  { role: "Accountant", email: "accountant@demo.my", blurb: "Review & post" },
  { role: "Tax", email: "tax@demo.my", blurb: "SST & tax advise" },
  { role: "Audit", email: "audit@demo.my", blurb: "Readiness checks" },
  { role: "Manager", email: "manager@demo.my", blurb: "Month-end close" },
  { role: "Boss", email: "boss@demo.my", blurb: "Firm overview" }
];

const flow = [
  "Client uploads or scans",
  "AI tidies & extracts",
  "Accountant posts books",
  "Tax · Audit · Close"
];

export default function HomePage() {
  return (
    <main className="container grid">
      <section className="card">
        <div className="page-header">
          <h1>AI Finance OS</h1>
          <p className="muted">
            Malaysian SME accounting workflow — from client documents to posted books, tax pack,
            audit readiness, and firm oversight.
          </p>
        </div>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link className="btn" href="/login">
            Sign in to demo
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>How work moves</h2>
        <div className="metrics">
          {flow.map((step, i) => (
            <div key={step} className="demo-chip">
              <strong>
                {i + 1}. {step}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Demo logins</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Password for every account: <strong>demo1234</strong>
        </p>
        <div className="demo-grid">
          {demos.map((d) => (
            <div key={d.email} className="demo-chip">
              <strong>{d.role}</strong>
              <code>{d.email}</code>
              <span className="muted" style={{ fontSize: 13 }}>
                {d.blurb}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
