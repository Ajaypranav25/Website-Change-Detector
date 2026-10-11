"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { apiRequest } from "@/lib/api";
import { formatInterval, INTERVAL_OPTIONS } from "@/lib/intervals";

function guessName(url: string): string {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const path = parsed.pathname.replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path && path.length < 30 ? path : ""}`;
  } catch {
    return "";
  }
}

export function NewMonitorForm({ initialUrl }: { initialUrl: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [name, setName] = useState(guessName(initialUrl));
  const [nameTouched, setNameTouched] = useState(false);
  const [interval, setIntervalMinutes] = useState(60);
  const [sensitivity, setSensitivity] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await apiRequest<{ id: string }>("/api/monitors", {
        method: "POST",
        body: JSON.stringify({ url, name, intervalMinutes: interval, sensitivity }),
      });
      router.push(`/monitors/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="panel panel-pad stack" onSubmit={onSubmit} style={{ maxWidth: 640 }}>
      <label className="field">
        <span>Page URL</span>
        <input
          className="input"
          required
          placeholder="https://example.com/pricing"
          value={url}
          inputMode="url"
          onChange={(e) => {
            setUrl(e.target.value);
            if (!nameTouched) setName(guessName(e.target.value));
          }}
        />
      </label>
      <label className="field">
        <span>Name</span>
        <input
          className="input"
          required
          maxLength={120}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
        />
      </label>
      <label className="field">
        <span>Check interval</span>
        <select className="select" value={interval} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
          {INTERVAL_OPTIONS.map((m) => (
            <option key={m} value={m}>
              Every {formatInterval(m)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Sensitivity · {sensitivity}</span>
        <input type="range" min={0} max={100} value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} />
        <p className="form-note">Low: only big rewrites, with numbers ignored. High: any text change counts.</p>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Adding…" : "Start Watching"}
        </button>
        <p className="form-note">The first check runs right away and becomes the baseline.</p>
      </div>
    </form>
  );
}
