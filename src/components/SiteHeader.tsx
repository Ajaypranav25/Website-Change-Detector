import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

interface NavItem {
  href: string;
  label: string;
}

const MARKETING_NAV: NavItem[] = [
  { href: "/#features", label: "Product" },
  { href: "/#noise", label: "Noise Filtering" },
  { href: "/#design", label: "How It Works" },
  { href: "/dashboard", label: "Dashboard" },
];

const APP_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/monitors/new", label: "New Monitor" },
  { href: "/settings", label: "Alerts" },
  { href: "/#design", label: "How It Works" },
];

interface Props {
  variant: "marketing" | "app";
  signedIn: boolean;
  current?: string;
}

export function SiteHeader({ variant, signedIn, current }: Props) {
  const nav = variant === "app" ? APP_NAV : MARKETING_NAV;
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Driftwatch home">
        <span className="brand-mark" aria-hidden="true" />
        Driftwatch
      </Link>
      <nav className="site-nav" aria-label="Main">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} aria-current={current === item.href ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="header-actions">
        {variant === "app" && signedIn ? (
          <LogoutButton />
        ) : (
          <Link className="btn btn-primary" href={signedIn ? "/dashboard" : "/login"}>
            {signedIn ? "Open Dashboard" : "Sign In"}
          </Link>
        )}
      </div>
    </header>
  );
}

export function GridLines() {
  return (
    <div className="grid-lines" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
