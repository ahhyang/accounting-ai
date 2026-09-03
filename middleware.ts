import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { AppPortal } from "@/lib/permissions/constants";

const PORTAL_PREFIX: Record<AppPortal, string> = {
  client: "/client",
  accountant: "/accountant",
  tax: "/tax",
  audit: "/auditor",
  manager: "/manager",
  boss: "/boss"
};

function portalFromPath(path: string): AppPortal | null {
  if (path.startsWith("/client")) return "client";
  if (path.startsWith("/accountant")) return "accountant";
  if (path.startsWith("/tax")) return "tax";
  if (path.startsWith("/auditor")) return "audit";
  if (path.startsWith("/manager")) return "manager";
  if (path.startsWith("/boss")) return "boss";
  return null;
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const userPortal = (token?.portal as AppPortal | undefined) ?? "accountant";
    const pathPortal = portalFromPath(path);

    // Accountants/managers/boss may open client view for support
    if (path.startsWith("/client") && userPortal !== "client") {
      if (["accountant", "manager", "boss"].includes(userPortal)) {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL(PORTAL_PREFIX[userPortal], req.url));
    }

    if (pathPortal && pathPortal !== userPortal) {
      // Boss can peek into all firm portals
      if (userPortal === "boss") return NextResponse.next();
      // Manager can open accountant books + month-end related
      if (userPortal === "manager" && (pathPortal === "accountant" || pathPortal === "tax")) {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL(PORTAL_PREFIX[userPortal], req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        if (
          path.startsWith("/client") ||
          path.startsWith("/accountant") ||
          path.startsWith("/tax") ||
          path.startsWith("/auditor") ||
          path.startsWith("/manager") ||
          path.startsWith("/boss") ||
          path.startsWith("/admin")
        ) {
          return !!token;
        }
        return true;
      }
    }
  }
);

export const config = {
  matcher: [
    "/client/:path*",
    "/accountant/:path*",
    "/tax/:path*",
    "/auditor/:path*",
    "/manager/:path*",
    "/boss/:path*",
    "/admin/:path*"
  ]
};
