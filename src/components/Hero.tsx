"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { StarField } from "./StarField";

interface Props {
  pagesWatched: number;
  changesCaught: number;
  signedIn: boolean;
}

export function Hero({ pagesWatched, changesCaught, signedIn }: Props) {
  const cardRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [url, setUrl] = useState("");

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next = `/monitors/new${url.trim() ? `?url=${encodeURIComponent(url.trim())}` : ""}`;
    router.push(signedIn ? next : `/signup?next=${encodeURIComponent(next)}`);
  };

  return (
    <section className="hero">
      <StarField anchorRef={cardRef} />

      <form ref={cardRef} className="hero-card" onSubmit={onSubmit} aria-label="Start watching a page">
        <p className="hero-card-label">Watch any page for changes</p>
        <div className="hero-card-input">
          <svg className="globe" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
          <label htmlFor="hero-url" className="sr-only">Page URL</label>
          <input
            id="hero-url"
            className="hero-input"
            placeholder="https://example.com/pricing"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="url"
            inputMode="url"
          />
          <button className="btn btn-primary" type="submit">
            Watch
          </button>
        </div>
        <div className="hero-card-stats">
          <span className="chip">
            Pages watched <b>{pagesWatched.toLocaleString("en-US")}</b>
          </span>
          <span className="chip">
            Changes caught <b>{changesCaught.toLocaleString("en-US")}</b>
          </span>
        </div>
      </form>

      <div className="hero-bottom">
        <div className="hero-left">
          <h1 className="hero-title">
            Catch every change
            <br />
            <span>that actually matters.</span>
          </h1>
          <div className="hero-ctas">
            <a className="btn btn-primary btn-lg" href={signedIn ? "/dashboard" : "/signup"}>
              {signedIn ? "Open Dashboard" : "Get Started"}
            </a>
            <a className="btn btn-ghost btn-lg" href="#design">
              How It Works
            </a>
          </div>
        </div>
        <p className="hero-copy">
          Monitor public pages in a real headless browser. Timestamps, counters, ads and rotating banners are filtered out,
          so you only hear about the changes you care about.
        </p>
      </div>
    </section>
  );
}
