"use client";

import Link from "next/link";
import type { Route } from "next";

export default function ClientDocumentsPage() {
  return (
    <main className="container grid">
      <section className="card">
        <h1>Documents</h1>
        <p className="muted">
          Send files to your accountant. Use <strong>Scan</strong> for a single bill/receipt photo,
          or <strong>Upload</strong> for any file type (PDF, Excel, ZIP, multiple files).
        </p>
      </section>

      <section className="grid metrics">
        <Link className="card" href={"/scan" as Route} style={{ color: "inherit" }}>
          <h2>Scan a bill</h2>
          <p className="muted">Camera or photo → AI fills a form → send to accountant.</p>
          <span className="btn" style={{ display: "inline-block", marginTop: 12 }}>
            Open scanner
          </span>
        </Link>
        <Link className="card" href={"/client/uploads" as Route} style={{ color: "inherit" }}>
          <h2>Upload files</h2>
          <p className="muted">Any type & size — bank PDFs, Excel, ZIP, payroll packs…</p>
          <span className="btn" style={{ display: "inline-block", marginTop: 12 }}>
            Upload files
          </span>
        </Link>
        <Link className="card" href={"/client/messages" as Route} style={{ color: "inherit" }}>
          <h2>Messages</h2>
          <p className="muted">If your accountant needs a clearer copy, reply here.</p>
          <span className="btn secondary" style={{ display: "inline-block", marginTop: 12 }}>
            Open messages
          </span>
        </Link>
      </section>
    </main>
  );
}
