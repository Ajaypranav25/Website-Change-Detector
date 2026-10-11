import { AppShell } from "@/components/AppShell";
import { SettingsForm } from "@/components/SettingsForm";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <AppShell current="/settings">
      <div className="page-head">
        <div>
          <p className="eyebrow">Alerts</p>
          <h1 className="page-title">Where changes are sent</h1>
          <p className="sub">Each alert has a summary and a link to the diff. The same content never alerts twice on any channel.</p>
        </div>
      </div>
      <SettingsForm
        email={user.email}
        emailAlerts={user.emailAlerts}
        dailyDigest={user.dailyDigest}
        discordWebhook={user.discordWebhook ?? ""}
        telegramChatId={user.telegramChatId ?? ""}
        smtpConfigured={Boolean(config.smtpUrl)}
        telegramConfigured={Boolean(config.telegramBotToken)}
      />
    </AppShell>
  );
}
