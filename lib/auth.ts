import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";

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
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
};

/** Always re-reads the user from the DB so deactivation takes effect immediately. */
export async function requireUser() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) redirect("/login");
  const user = await db.user.findUnique({
    where: { id },
    include: { memberships: { include: { department: true } } },
  });
  if (!user || user.status !== "ACTIVE") redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") redirect("/");
  return user;
}
