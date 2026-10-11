import { GridLines, SiteHeader } from "./SiteHeader";

export function AppShell({ current, children }: { current?: string; children: React.ReactNode }) {
  return (
    <div className="frame">
      <GridLines />
      <SiteHeader variant="app" signedIn current={current} />
      <main className="page">{children}</main>
    </div>
  );
}
