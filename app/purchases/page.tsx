"use client";

import { Suspense, useEffect, useState } from "react";
import { EmptyState } from "@/app/components/EmptyState";
import { useCompanyId } from "@/app/components/useCompanyId";
import { statusLabel } from "@/lib/ux/labels";

type Supplier = { id: string; name: string };
type Bill = {
  id: string;
  billNumber: string;
  total: number | string;
  status: string;
  supplier: { name: string };
};

function PurchasesPageInner() {
  const { companyId, companyName, ready, loadingSession } = useCompanyId();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [aging, setAging] = useState<
    Array<{ billNumber: string; outstanding: number; bucket: string; supplier: { name: string } }>
  >([]);
  const [duplicates, setDuplicates] = useState<
    Array<{ supplier: string; total: number; bills: Bill[] }>
  >([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", email: "" });
  const [billForm, setBillForm] = useState({
    supplierId: "",
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    subtotal: "500",
    taxAmount: "0",
    description: ""
  });
  const [paymentForm, setPaymentForm] = useState({
    supplierId: "",
    billId: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: ""
  });

  async function loadAll() {
    if (!companyId) return;
    setLoading(true);
    const [sRes, bRes, aRes, dRes] = await Promise.all([
      fetch(`/api/companies/${companyId}/suppliers`),
      fetch(`/api/companies/${companyId}/bills`),
      fetch(`/api/companies/${companyId}/bills?aging=1`),
      fetch(`/api/companies/${companyId}/bills?duplicates=1`)
    ]);
    const s = await sRes.json();
    const b = await bRes.json();
    const a = await aRes.json();
    const d = await dRes.json();
    if (s.ok) setSuppliers(s.suppliers);
    if (b.ok) setBills(b.bills);
    if (a.ok) setAging(a.aging);
    if (d.ok) setDuplicates(d.duplicates);
    setLoading(false);
  }

  useEffect(() => {
    if (ready) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, companyId]);

  async function addSupplier(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/companies/${companyId}/suppliers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(supplierForm)
    });
    const data = await res.json();
    setMessage(data.ok ? `Supplier ${data.supplier.name} created.` : String(data.error));
    if (data.ok) {
      setSupplierForm({ name: "", email: "" });
      await loadAll();
    }
  }

  async function addBill(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/companies/${companyId}/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...billForm,
        subtotal: Number(billForm.subtotal),
        taxAmount: Number(billForm.taxAmount)
      })
    });
    const data = await res.json();
    setMessage(data.ok ? `Bill ${data.bill.billNumber} posted.` : String(data.error));
    if (data.ok) await loadAll();
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/companies/${companyId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...paymentForm, amount: Number(paymentForm.amount) })
    });
    const data = await res.json();
    setMessage(
      data.ok
        ? `Payment ${data.payment.paymentNumber} posted. Bill now ${statusLabel(data.billStatus)}.`
        : String(data.error)
    );
    if (data.ok) await loadAll();
  }

  if (loadingSession) {
    return (
      <main className="container">
        <p className="muted">Loading company…</p>
      </main>
    );
  }

  if (!companyId) {
    return (
      <main className="container">
        <EmptyState title="Sign in required" hint="Log in to open Purchases for your company." />
      </main>
    );
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Purchases / Accounts Payable</h1>
        <p className="muted">
          {companyName || "Your company"} — suppliers, bills, payments + duplicate detection.
        </p>
        <div className="row">
          <button type="button" className="btn secondary" onClick={loadAll} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <a
            className="btn secondary"
            href={`/api/companies/${companyId}/export/bills?format=xlsx`}
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            Export Excel
          </a>
        </div>
        {message && <p className="message">{message}</p>}
      </section>

      <section className="card">
        <h2>Add supplier</h2>
        <form className="form grid" onSubmit={addSupplier}>
          <label>
            Name
            <input
              required
              value={supplierForm.name}
              onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              value={supplierForm.email}
              onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
            />
          </label>
          <button className="btn" type="submit">
            Create supplier
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Create bill</h2>
        {suppliers.length === 0 ? (
          <EmptyState title="No suppliers yet" hint="Create a supplier first." />
        ) : (
          <form className="form grid" onSubmit={addBill}>
            <label>
              Supplier
              <select
                required
                value={billForm.supplierId}
                onChange={(e) => setBillForm({ ...billForm, supplierId: e.target.value })}
              >
                <option value="">Select…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bill date
              <input
                type="date"
                value={billForm.billDate}
                onChange={(e) => setBillForm({ ...billForm, billDate: e.target.value })}
              />
            </label>
            <label>
              Due date
              <input
                type="date"
                value={billForm.dueDate}
                onChange={(e) => setBillForm({ ...billForm, dueDate: e.target.value })}
              />
            </label>
            <label>
              Subtotal
              <input
                value={billForm.subtotal}
                onChange={(e) => setBillForm({ ...billForm, subtotal: e.target.value })}
              />
            </label>
            <label>
              Tax (input SST)
              <input
                value={billForm.taxAmount}
                onChange={(e) => setBillForm({ ...billForm, taxAmount: e.target.value })}
              />
            </label>
            <button className="btn" type="submit">
              Post bill
            </button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>Pay bill</h2>
        <form className="form grid" onSubmit={addPayment}>
          <label>
            Supplier
            <select
              required
              value={paymentForm.supplierId}
              onChange={(e) => setPaymentForm({ ...paymentForm, supplierId: e.target.value })}
            >
              <option value="">Select…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bill
            <select
              required
              value={paymentForm.billId}
              onChange={(e) => setPaymentForm({ ...paymentForm, billId: e.target.value })}
            >
              <option value="">Select…</option>
              {bills
                .filter((b) => b.status !== "PAID")
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.billNumber} — RM{Number(b.total).toFixed(2)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Amount
            <input
              required
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
            />
          </label>
          <button className="btn" type="submit">
            Post payment
          </button>
        </form>
      </section>

      {duplicates.length > 0 && (
        <section className="card">
          <h2>Possible duplicate bills</h2>
          <ul>
            {duplicates.map((d, idx) => (
              <li key={idx}>
                {d.supplier}: RM{d.total.toFixed(2)} — {d.bills.length} similar bills
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Bills</h2>
        {bills.length === 0 ? (
          <EmptyState title="No bills yet" hint="Create a bill or scan a receipt." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Supplier</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td>{b.billNumber}</td>
                  <td>{b.supplier.name}</td>
                  <td>RM{Number(b.total).toFixed(2)}</td>
                  <td>{statusLabel(b.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>AP aging</h2>
        {aging.length === 0 ? (
          <EmptyState title="Nothing outstanding" hint="Open bills will appear here." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Bill</th>
                <th>Outstanding</th>
                <th>Bucket</th>
              </tr>
            </thead>
            <tbody>
              {aging.map((row) => (
                <tr key={row.billNumber}>
                  <td>{row.supplier.name}</td>
                  <td>{row.billNumber}</td>
                  <td>RM{row.outstanding.toFixed(2)}</td>
                  <td>{row.bucket}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

export default function PurchasesPage() {
  return (
    <Suspense
      fallback={
        <main className="container">
          <p>Loading purchases…</p>
        </main>
      }
    >
      <PurchasesPageInner />
    </Suspense>
  );
}
