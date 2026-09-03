import "next-auth";
import "next-auth/jwt";
import type { AppPortal } from "@/lib/permissions/constants";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      companyId: string;
      companyName: string;
      roleName: string;
      isOwner: boolean;
      portal: AppPortal;
      isClient: boolean;
      isAccountant: boolean;
    };
  }

  interface User {
    companyId?: string;
    companyName?: string;
    roleName?: string;
    isOwner?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    companyId?: string;
    companyName?: string;
    roleName?: string;
    isOwner?: boolean;
    portal?: AppPortal;
  }
}
