import nodemailer from "nodemailer";
import { config } from "../config";
import { type ChangeMessage, renderPlainText } from "./compose";

export type SendResult = { ok: true } | { ok: false; skipped: boolean; detail: string };

const TIMEOUT_MS = 10_000;

async function postJson(url: string, body: unknown): Promise<SendResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return { ok: true };
  // Throwing on 5xx/429 lets the queue retry; 4xx is a permanent misconfiguration.
  if (res.status >= 500 || res.status === 429) throw new Error(`Webhook responded ${res.status}`);
  return { ok: false, skipped: false, detail: `Webhook rejected the message (${res.status})` };
}

export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  if (!config.smtpUrl) return { ok: false, skipped: true, detail: "SMTP_URL not configured" };
  const transport = nodemailer.createTransport(config.smtpUrl);
  await transport.sendMail({ from: config.smtpFrom, to, subject, text });
  return { ok: true };
}

export async function sendDiscord(webhook: string, msg: ChangeMessage, url: string): Promise<SendResult> {
  return postJson(webhook, {
    username: "Driftwatch",
    embeds: [
      {
        title: msg.subject.slice(0, 250),
        url: msg.compareUrl,
        description: [msg.summary, url, "```diff", ...msg.excerpt, "```"].join("\n").slice(0, 4000),
        color: 0x2f5bff,
      },
    ],
  });
}

export async function sendTelegram(chatId: string, text: string): Promise<SendResult> {
  const token = config.telegramBotToken;
  if (!token) return { ok: false, skipped: true, detail: "TELEGRAM_BOT_TOKEN not configured" };
  return postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
  });
}

export function plainTextFor(msg: ChangeMessage, url: string): string {
  return renderPlainText(msg, url);
}
