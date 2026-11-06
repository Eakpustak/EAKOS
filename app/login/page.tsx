"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: f.get("email"),
      password: f.get("password"),
      redirect: false,
    });
    setBusy(false);
    if (res?.ok) window.location.href = "/";
    else setError("Email or password is incorrect, or the account is not active.");
  }

  return (
    <div className="login panel">
      <h1>Sign in</h1>
      <p className="sub">Use the account your administrator created for you.</p>
      <form onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="err" role="alert">{error}</p>}
        <p><button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></p>
      </form>
    </div>
  );
}
