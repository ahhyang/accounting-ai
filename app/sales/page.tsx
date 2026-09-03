"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

type Customer = { id: string; name: string; outstanding?: number };
type Invoice = {
  id: string;
  invoiceNumber: string;
  total: number | string;
  status: string;
  customer: { name: string };
};

function SalesPageInner() {
  const searchParams = useSearchParams();
  const [companyId, setCompanyId] = useState(searchParams.get("companyId") || "");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [aging, setAging] = useState<Array<{ invoiceNumber: string; outstanding: number; bucket: string; customer: { name: string } }>>([]);
  const [message, setMessage] = useState("");
  const [customerForm, setCustomerForm] = useState({ name: "", email: "" });
  const [invoiceForm, setInvoiceForm] = useState({
    customerId: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    subtotal: "1000",
    taxAmount: "0",
    description: ""
  });
  const [receiptForm, setReceiptForm] = useState({
    customerId: "",
    invoiceId: "",
    receiptDate: new Date().toISOString().slice(0, 10),
    amount: ""
  });

  async function loadAll() {
    if (!companyId) return;
    const [cRes, iRes, aRes] = await Promise.all([
      fetch(`/api/companies/${companyId}/customers`),
      fetch(`/api/companies/${companyId}/invoices`),
      fetch(`/api/companies/${companyId}/invoices?aging=1`)
    ]);
    const c = await cRes.json();
    const i = await iRes.json();
    const a = await aRes.json();
    if (c.ok) setCustomers(c.customers);
    if (i.ok) setInvoices(i.invoices);
    if (a.ok) setAging(a.aging);
  }

  async function addCustomer(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/companies/${companyId}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customerForm)
    });
    const data = await res.json();
    setMessage(data.ok ? `Customer ${data.customer.name} created.` : String(data.error));
    if (data.ok) {
      setCustomerForm({ name: "", email: "" });
      await loadAll();
    }
  }

  async function addInvoice(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/companies/${companyId}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...invoiceForm,
        subtotal: Number(invoiceForm.subtotal),
        taxAmount: Number(invoiceForm.taxAmount)
      })
    });
    const data = await res.json();
    setMessage(
      data.ok
        ? `Invoice ${data.invoice.invoiceNumber} posted to GL.`
        : String(data.error)
    );
    if (data.ok) await loadAll();
  }

  async function addReceipt(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/companies/${companyId}/receipts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...receiptForm,
        amount: Number(receiptForm.amount)
      })
    });
    const data = await res.json();
    setMessage(
      data.ok
        ? `Receipt ${data.receipt.receiptNumber} posted. Invoice now ${data.invoiceStatus}.`
        : String(data.error)
    );
    if (data.ok) await loadAll();
  }

  return (
    <main className="container grid">
      <section className="card">
        <h1>Sales / Accounts Receivable</h1>
        <p className="muted">Customers → invoices → receipts, all posting to the shared GL.</p>
        <div className="row">
          <input placeholder="Company ID" value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
          <button type="button" className="btn" onClick={loadAll}>Load AR</button>
        </div>
        {message && <p className="message">{message}</p>}
      </section>

      <section className="card">
        <h2>Add Customer</h2>
        <form className="form grid" onSubmit={addCustomer}>
          <label>Name<input required value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} /></label>
          <label>Email<input value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} /></label>
          <button className="btn" type="submit">Create Customer</button>
        </form>
      </section>

      <section className="card">
        <h2>Create Invoice</h2>
        <form className="form grid" onSubmit={addInvoice}>
          <label>
            Customer
            <select required value={invoiceForm.customerId} onChange={(e) => setInvoiceForm({ ...invoiceForm, customerId: e.target.value })}>
              <option value="">Select...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>Invoice date<input type="date" value={invoiceForm.invoiceDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })} /></label>
          <label>Due date<input type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} /></label>
          <label>Subtotal<input value={invoiceForm.subtotal} onChange={(e) => setInvoiceForm({ ...invoiceForm, subtotal: e.target.value })} /></label>
          <label>Tax<input value={invoiceForm.taxAmount} onChange={(e) => setInvoiceForm({ ...invoiceForm, taxAmount: e.target.value })} /></label>
          <button className="btn" type="submit">Post Invoice</button>
        </form>
      </section>

      <section className="card">
        <h2>Record Receipt</h2>
        <form className="form grid" onSubmit={addReceipt}>
          <label>
            Customer
            <select required value={receiptForm.customerId} onChange={(e) => setReceiptForm({ ...receiptForm, customerId: e.target.value })}>
              <option value="">Select...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Invoice
            <select required value={receiptForm.invoiceId} onChange={(e) => setReceiptForm({ ...receiptForm, invoiceId: e.target.value })}>
              <option value="">Select...</option>
              {invoices.filter((i) => i.status !== "PAID").map((i) => (
                <option key={i.id} value={i.id}>{i.invoiceNumber} — RM{Number(i.total).toFixed(2)}</option>
              ))}
            </select>
          </label>
          <label>Amount<input required value={receiptForm.amount} onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })} /></label>
          <button className="btn" type="submit">Post Receipt</button>
        </form>
      </section>

      {aging.length > 0 && (
        <section className="card">
          <h2>AR Aging</h2>
          <table className="table">
            <thead>
              <tr><th>Customer</th><th>Invoice</th><th>Outstanding</th><th>Bucket</th></tr>
            </thead>
            <tbody>
              {aging.map((row) => (
                <tr key={row.invoiceNumber}>
                  <td>{row.customer.name}</td>
                  <td>{row.invoiceNumber}</td>
                  <td>RM{row.outstanding.toFixed(2)}</td>
                  <td>{row.bucket}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<main className="container"><p>Loading sales...</p></main>}>
      <SalesPageInner />
    </Suspense>
  );
}
