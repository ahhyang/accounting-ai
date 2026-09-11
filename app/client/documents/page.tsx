"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

/** Documents hub now redirects to bulk upload — clients don't pick folders. */
export default function ClientDocumentsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/client/uploads" as Route);
  }, [router]);

  return (
    <main className="container">
      <p className="muted">Opening bulk upload…</p>
    </main>
  );
}
