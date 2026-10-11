import { AppShell } from "@/components/AppShell";
import { NewMonitorForm } from "@/components/NewMonitorForm";
import { requireUser } from "@/lib/auth";

export default async function NewMonitorPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  await requireUser();
  const { url } = await searchParams;
  return (
    <AppShell current="/monitors/new">
      <div className="page-head">
        <div>
          <p className="eyebrow">New monitor</p>
          <h1 className="page-title">Watch a page</h1>
          <p className="sub">Public pages only. Pages are rendered in a headless browser and never logged into.</p>
        </div>
      </div>
      <NewMonitorForm initialUrl={typeof url === "string" ? url.slice(0, 2048) : ""} />
    </AppShell>
  );
}
