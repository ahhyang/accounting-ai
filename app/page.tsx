import Link from "next/link";

const moduleMap = [
  "Scan Bill / Receipt (camera, OCR, Excel export)",
  "Client Portal (guided uploads)",
  "Accountant Inbox (AI approve / manual)",
  "Tax pack (SST input/output)",
  "Audit readiness (trial balance + exceptions)",
  "Manager month-end close",
  "Boss / Partner firm oversight",
  "Sales / AR · Purchases / AP · Banking"
];

const demos = [
  { role: "Client", email: "client@demo.my" },
  { role: "Accountant", email: "accountant@demo.my" },
  { role: "Tax", email: "tax@demo.my" },
  { role: "Audit", email: "audit@demo.my" },
  { role: "Manager", email: "manager@demo.my" },
  { role: "Boss", email: "boss@demo.my" }
];

export default function HomePage() {
  return (
    <main className="container grid">
      <section className="card">
        <h1>AI Finance OS</h1>
        <p className="muted">
          Built for Malaysian SME accounting firms: Client uploads → Accountant books → Tax pack →
          Audit readiness → Manager close → Boss oversight.
        </p>
        <div className="row">
          <Link className="btn" href="/login">
            Sign in
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>Demo logins</h2>
        <p className="muted">Password for all accounts: demo1234</p>
        <ul>
          {demos.map((d) => (
            <li key={d.email}>
              {d.role}: {d.email}
            </li>
          ))}
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
