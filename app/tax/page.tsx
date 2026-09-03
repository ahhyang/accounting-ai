"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

type TaxPack = {
  settings: { sstRegistered: boolean; sstNumber: string | null };
  period: { id: string; startDate: string; endDate: string } | null;
  sst: { outputTax: number; inputTax: number; netPayable: number; status: string };
  schedules: {
    taxableSales: { count: number; tax: number; total: number };
    taxablePurchases: { count: number; tax: number; total: number };
  };
  checklist: Array<{ key: string; label: string; done: boolean }>;
};

export default function TaxPortalPage() {
  const { data: session } = useSession();
  const companyId = session?.user?.companyId ?? "";
  const [pack, setPack] = useState<TaxPack | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/companies/${companyId}/tax`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setPack(data);
        else setError(String(data.error));
      });
  }, [companyId]);

  return (
    <main className="container grid">
      <section className="card">
        <h1>Tax workspace</h1>
        <p className="muted">
          Malaysian tax agent view — SST input/output, taxable schedules, and LHDN readiness.
          Books stay with the accountant; you prepare the tax pack.
        </p>
        <p className="muted">{session?.user?.companyName}</p>
      </section>

      {error && <p className="message error">{error}</p>}

      {pack && (
        <>
          <section className="grid metrics">
            <div className="card">
              <h3>SST output</h3>
              <p>RM{pack.sst.outputTax.toFixed(2)}</p>
            </div>
            <div className="card">
              <h3>SST input</h3>
              <p>RM{pack.sst.inputTax.toFixed(2)}</p>
            </div>
            <div className="card">
              <h3>Net {pack.sst.netPayable >= 0 ? "payable" : "refund"}</h3>
              <p>RM{Math.abs(pack.sst.netPayable).toFixed(2)}</p>
            </div>
          </section>

          <section className="card">
            <h2>Registration</h2>
            <p>
              SST registered:{" "}
              <strong>{pack.settings.sstRegistered ? "Yes" : "No"}</strong>
              {pack.settings.sstNumber ? ` · ${pack.settings.sstNumber}` : ""}
            </p>
            <p className="muted">
              Period:{" "}
              {pack.period
                ? `${new Date(pack.period.startDate).toLocaleDateString()} – ${new Date(pack.period.endDate).toLocaleDateString()}`
                : "Latest"}
            </p>
          </section>

          <section className="card">
            <h2>Taxable schedules</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>Count</th>
                  <th>Tax</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Taxable sales</td>
                  <td>{pack.schedules.taxableSales.count}</td>
                  <td>RM{pack.schedules.taxableSales.tax.toFixed(2)}</td>
                  <td>RM{pack.schedules.taxableSales.total.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Taxable purchases</td>
                  <td>{pack.schedules.taxablePurchases.count}</td>
                  <td>RM{pack.schedules.taxablePurchases.tax.toFixed(2)}</td>
                  <td>RM{pack.schedules.taxablePurchases.total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Tax pack checklist</h2>
            <ul>
              {pack.checklist.map((item) => (
                <li key={item.key}>
                  {item.done ? "✓" : "○"} {item.label}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="card links">
        <Link href="/sales">Sales (AR) →</Link>
        <Link href="/purchases">Purchases (AP) →</Link>
      </section>
    </main>
  );
}
