import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isAccountantRole, isClientRole } from "@/lib/permissions/constants";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: {
            memberships: {
              include: { role: true, company: true },
              orderBy: { createdAt: "asc" }
            }
          }
        });

        if (!user?.passwordHash) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        const membership = user.memberships[0];
        if (!membership) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          companyId: membership.companyId,
          companyName: membership.company.name,
          roleName: membership.role.name,
          isOwner: membership.isOwner
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as {
          id: string;
          companyId: string;
          companyName: string;
          roleName: string;
          isOwner: boolean;
        };
        token.userId = u.id;
        token.companyId = u.companyId;
        token.companyName = u.companyName;
        token.roleName = u.roleName;
        token.isOwner = u.isOwner;
        token.portal = isClientRole(u.roleName) ? "client" : "accountant";
      }

      if (trigger === "update" && session?.companyId) {
        const membership = await db.companyUser.findUnique({
          where: {
            companyId_userId: {
              companyId: session.companyId as string,
              userId: token.userId as string
            }
          },
          include: { role: true, company: true }
        });
        if (membership) {
          token.companyId = membership.companyId;
          token.companyName = membership.company.name;
          token.roleName = membership.role.name;
          token.isOwner = membership.isOwner;
          token.portal = isClientRole(membership.role.name) ? "client" : "accountant";
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.companyId = token.companyId as string;
        session.user.companyName = token.companyName as string;
        session.user.roleName = token.roleName as string;
        session.user.isOwner = Boolean(token.isOwner);
        session.user.portal = (token.portal as "client" | "accountant") ?? "accountant";
        session.user.isClient = isClientRole(String(token.roleName));
        session.user.isAccountant = isAccountantRole(String(token.roleName));
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET || "dev-secret-change-me"
};
