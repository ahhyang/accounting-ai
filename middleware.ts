import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const portal = token?.portal as string | undefined;

    if (path.startsWith("/client") && portal === "accountant") {
      // accountants may open client view for support; allow
      return NextResponse.next();
    }

    if (path.startsWith("/accountant") && portal === "client") {
      return NextResponse.redirect(new URL("/client", req.url));
    }

    if (path.startsWith("/admin") && portal === "client") {
      return NextResponse.redirect(new URL("/client", req.url));
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
  matcher: ["/client/:path*", "/accountant/:path*", "/admin/:path*"]
};
