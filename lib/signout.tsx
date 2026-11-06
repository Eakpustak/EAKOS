"use client";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button className="quiet" onClick={() => signOut({ callbackUrl: "/login" })}>
      Sign out
    </button>
  );
}
