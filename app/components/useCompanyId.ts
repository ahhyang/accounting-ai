"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

/** Resolve companyId from session (preferred) or ?companyId= for deep links. */
export function useCompanyId() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const fromQuery = searchParams.get("companyId") || "";
  const fromSession = session?.user?.companyId || "";
  const [companyId, setCompanyId] = useState(fromQuery || fromSession);

  useEffect(() => {
    const next = fromQuery || fromSession;
    if (next && next !== companyId) setCompanyId(next);
  }, [fromQuery, fromSession, companyId]);

  return {
    companyId,
    setCompanyId,
    companyName: session?.user?.companyName || "",
    ready: status !== "loading" && Boolean(companyId),
    loadingSession: status === "loading"
  };
}
