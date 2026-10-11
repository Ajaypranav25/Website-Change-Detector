"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { apiRequest, safeNextPath } from "@/lib/api";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const isLogin = mode === "login";
  const otherHref = `${isLogin ? "/signup" : "/login"}${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <form className="auth-card glass stack" onSubmit={onSubmit}>
      <div>
        <p className="eyebrow">{isLogin ? "Welcome back" : "Get started"}</p>
        <h1 className="page-title" style={{ fontSize: 28 }}>
          {isLogin ? "Sign in" : "Create account"}
        </h1>
      </div>
      <label className="field">
        <span>Email</span>
        <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          className="input"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          minLength={isLogin ? 1 : 8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
        {busy ? "Please wait…" : isLogin ? "Sign In" : "Create Account"}
      </button>
      <p className="form-note">
        {isLogin ? "No account yet? " : "Already have an account? "}
        <Link href={otherHref} style={{ color: "var(--fg)", textDecoration: "underline" }}>
          {isLogin ? "Create one" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}
