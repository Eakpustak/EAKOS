import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { isSessionStale } from "./account";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;
        const user = await db.user.findUnique({ where: { email } });
        const ok = user?.passwordHash
          ? await bcrypt.compare(password, user.passwordHash)
          : false;
        if (!user || !ok || user.status !== "ACTIVE") {
          await db.auditEvent.create({
            data: { action: "auth.login", resourceType: "user", outcome: "denied", metadata: { email } },
          });
          return null;
        }
        await db.auditEvent.create({
          data: { actorUserId: user.id, action: "auth.login", resourceType: "user", resourceId: user.id, outcome: "success" },
        });
        return { id: user.id, email: user.email, name: user.displayName };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        // When this sign-in began; compared with User.passwordChangedAt in requireUser.
        token.authAt = Math.floor(Date.now() / 1000);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.uid as string;
      (session as unknown as { authAt?: number }).authAt = typeof token.authAt === "number" ? token.authAt : undefined;
      return session;
    },
  },
};

/**
 * Always re-reads the user from the DB so deactivation takes effect immediately.
 * Also refuses a sign-in that began before the last password change, and sends someone who is still
 * on a temporary password to /settings. Only the settings page and its actions pass
 * `allowPasswordChange`, so a temporary password cannot be used for anything else.
 */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}) {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) redirect("/login");
  const authAt = (session as unknown as { authAt?: number } | null)?.authAt;
  const user = await db.user.findUnique({
    where: { id },
    include: { memberships: { include: { department: true } } },
  });
  if (!user || user.status !== "ACTIVE") redirect("/login");
  if (isSessionStale(authAt, user.passwordChangedAt)) redirect("/login");
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/settings?required=1");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") redirect("/");
  return user;
}
