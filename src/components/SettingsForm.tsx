"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { apiRequest } from "@/lib/api";

interface Props {
  email: string;
  emailAlerts: boolean;
  dailyDigest: boolean;
  discordWebhook: string;
  telegramChatId: string;
  smtpConfigured: boolean;
  telegramConfigured: boolean;
}

export function SettingsForm(props: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    emailAlerts: props.emailAlerts,
    dailyDigest: props.dailyDigest,
    discordWebhook: props.discordWebhook,
    telegramChatId: props.telegramChatId,
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest("/api/settings", { method: "PUT", body: JSON.stringify(form) });
      setMessage({ ok: true, text: "Alert settings saved" });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel panel-pad stack" onSubmit={onSubmit} style={{ maxWidth: 680 }}>
      <h2 className="panel-title">Email</h2>
      <label className="toggle">
        <input type="checkbox" checked={form.emailAlerts} onChange={(e) => setForm({ ...form, emailAlerts: e.target.checked })} />
        Email change alerts to {props.email}
      </label>
      <label className="toggle">
        <input type="checkbox" checked={form.dailyDigest} onChange={(e) => setForm({ ...form, dailyDigest: e.target.checked })} />
        Bundle email alerts into one daily digest (08:00)
      </label>
      {!props.smtpConfigured && <p className="form-note">SMTP_URL is not set on the server, so email alerts are recorded as skipped.</p>}

      <div className="hline" />
      <h2 className="panel-title">Discord</h2>
      <label className="field">
        <span>Webhook URL</span>
        <input
          className="input"
          placeholder="https://discord.com/api/webhooks/…"
          value={form.discordWebhook}
          onChange={(e) => setForm({ ...form, discordWebhook: e.target.value })}
        />
      </label>

      <div className="hline" />
      <h2 className="panel-title">Telegram</h2>
      <label className="field">
        <span>Chat ID</span>
        <input
          className="input"
          placeholder="e.g. 123456789"
          inputMode="numeric"
          value={form.telegramChatId}
          onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
        />
      </label>
      <p className="form-note">
        {props.telegramConfigured
          ? "Message the server's bot first, then paste your chat id here."
          : "TELEGRAM_BOT_TOKEN is not set on the server, so Telegram alerts are recorded as skipped."}
      </p>

      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>Save Alert Settings</button>
        {message && <span className={message.ok ? "toast" : "form-error"} role="status">{message.text}</span>}
      </div>
    </form>
  );
}
