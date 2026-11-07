"use client";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button type="button" className="ghost icon sm" aria-label="Sign out" title="Sign out" onClick={() => signOut({ callbackUrl: "/login" })}>
      <LogOut className="ic" aria-hidden="true" />
    </button>
  );
}
