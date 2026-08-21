import Link from "next/link";

const moduleMap = [
  "Client Portal (guided uploads)",
  "Accountant Inbox (AI approve / manual)",
  "Sales / AR",
  "Purchases / AP",
  "Banking & Reconciliation",
  "Month-End + Audit Trail",
  "Client Monthly Reports"
];

export default function HomePage() {
  return (
    <main className="container grid">
      <section className="card">
        <h1>AI Finance OS</h1>
        <p className="muted">
          Clients upload with clear instructions. AI sorts and proposes journals. Accountants approve
          or enter manually. Both sides get reports and a full audit trail.
        </p>
        <div className="row">
          <Link className="btn" href="/login">
            Sign in
          </Link>
          <Link className="btn secondary" href="/client">
            Client Portal
          </Link>
          <Link className="btn secondary" href="/accountant">
            Accountant Workspace
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>Demo logins</h2>
        <ul>
          <li>Client: client@demo.my / demo1234</li>
          <li>Accountant: accountant@demo.my / demo1234</li>
        </ul>
      </section>

      <section className="card">
        <h2>Modules</h2>
        <ul>
          {moduleMap.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
