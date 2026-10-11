"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/api";
import { formatInterval, INTERVAL_OPTIONS } from "@/lib/intervals";
import type { NoiseRules } from "@/lib/noise";

const NOISE_LABELS: Record<keyof NoiseRules, string> = {
  timestamps: "Timestamps & relative dates",
  counters: "View / like / visitor counters",
  tokens: "Random tokens & IDs",
  ads: "Ads & cookie banners",
  banners: "Rotating banners & carousels",
};

interface Props {
  monitorId: string;
  name: string;
  intervalMinutes: number;
  sensitivity: number;
  noiseRules: NoiseRules;
  paused: boolean;
}

export function MonitorSettings(props: Props) {
  const router = useRouter();
  const [name, setName] = useState(props.name);
  const [intervalMinutes, setIntervalMinutes] = useState(props.intervalMinutes);
  const [sensitivity, setSensitivity] = useState(props.sensitivity);
  const [noiseRules, setNoiseRules] = useState(props.noiseRules);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ ok: true, text: success });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const patch = (body: object) => apiRequest(`/api/monitors/${props.monitorId}`, { method: "PATCH", body: JSON.stringify(body) });

  const save = () => run(() => patch({ name, intervalMinutes, sensitivity, noiseRules }), "Saved");
  const checkNow = () => run(() => apiRequest(`/api/monitors/${props.monitorId}/check`, { method: "POST" }), "Check queued. Refresh in a moment.");
  const togglePause = () => run(() => patch({ paused: !props.paused }), props.paused ? "Resumed" : "Paused");
  const remove = async () => {
    if (!window.confirm("Delete this monitor and all its versions?")) return;
    setBusy(true);
    try {
      await apiRequest(`/api/monitors/${props.monitorId}`, { method: "DELETE" });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={checkNow} disabled={busy}>Check Now</button>
        <button className="btn btn-ghost btn-sm" onClick={togglePause} disabled={busy}>{props.paused ? "Resume" : "Pause"}</button>
        <button className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>Delete</button>
      </div>

      <label className="field">
        <span>Name</span>
        <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Check interval</span>
        <select className="select" value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
          {INTERVAL_OPTIONS.map((m) => (
            <option key={m} value={m}>Every {formatInterval(m)}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Sensitivity · {sensitivity}</span>
        <input type="range" min={0} max={100} value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} />
        <p className="form-note">
          A change must touch at least {(((100 - sensitivity) / 100) * 20).toFixed(1)}% of the text{sensitivity < 25 ? ", and all numbers are ignored" : ""}.
        </p>
      </label>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <span>Noise filters</span>
        {(Object.keys(NOISE_LABELS) as (keyof NoiseRules)[]).map((key) => (
          <label className="toggle" key={key}>
            <input type="checkbox" checked={noiseRules[key]} onChange={(e) => setNoiseRules({ ...noiseRules, [key]: e.target.checked })} />
            {NOISE_LABELS[key]}
          </label>
        ))}
      </fieldset>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>Save Settings</button>
        {message && (
          <span className={message.ok ? "toast" : "form-error"} role="status">{message.text}</span>
        )}
      </div>
    </div>
  );
}
