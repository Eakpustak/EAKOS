"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { loginNotice } from "@/lib/account";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    setNotice(loginNotice(new URLSearchParams(window.location.search).get("notice")));
  }, []);

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
    <div className="auth">
      <aside className="auth-aside">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">EP</span>
          <span className="brand-name">EAK PUSTAK<small>Workspace</small></span>
        </div>
        <div>
          <h2>One place for the work that moves the company.</h2>
          <ul>
            <li><CheckCircle2 className="ic" aria-hidden="true" />Every task has one accountable owner</li>
            <li><CheckCircle2 className="ic" aria-hidden="true" />A clear history of who did what, and when</li>
            <li><ShieldCheck className="ic" aria-hidden="true" />You only see the work you are involved in</li>
          </ul>
        </div>
        <small>© EAK PUSTAK</small>
      </aside>
      <main className="auth-main" id="main">
        <div className="auth-card">
          <h1>Sign in</h1>
          <p className="sub">Use the account your administrator created for you.</p>
          <form onSubmit={onSubmit} noValidate={false}>
            {notice && !error && (
              <div className="alert ok" role="status"><CheckCircle2 className="ic" aria-hidden="true" /><span>{notice}</span></div>
            )}
            {error && (
              <div className="alert err" role="alert"><AlertCircle className="ic" aria-hidden="true" /><span>{error}</span></div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="username" required autoFocus placeholder="you@company.com" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="pw">
                <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required />
                <button type="button" className="ghost" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((v) => !v)}>
                  {show ? <EyeOff className="ic" aria-hidden="true" /> : <Eye className="ic" aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={busy}>
              {busy ? <><Loader2 className="ic spin" aria-hidden="true" />Signing in…</> : "Sign in"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
