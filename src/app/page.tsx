import { Hero } from "@/components/Hero";
import { GridLines, SiteHeader } from "@/components/SiteHeader";
import { currentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import "./landing.css";

export const dynamic = "force-dynamic";

const FEATURES = [
  { title: "Real browser renders", body: "Add a URL, a name and an interval from 15 min to 24 h. Pages render in headless Chromium, so JavaScript-built content counts." },
  { title: "Queue, timeouts, retries", body: "A scheduler feeds a Redis job queue with hard timeouts and exponential retries. Public pages only, never stored credentials." },
  { title: "Snapshots on change", body: "Every check captures text and a screenshot. A new version is stored only when the filtered content hash changes." },
  { title: "Noise filtering", body: "Timestamps, counters, ads, rotating banners and random tokens are masked. A sensitivity dial sets how big a change must be." },
  { title: "Visual region picker", body: "Click elements on the captured page to watch or ignore them. Choices are saved as CSS selectors." },
  { title: "Three kinds of diff", body: "Line-level text diff, a highlighted screenshot diff, and side-by-side comparison of any two versions." },
  { title: "Alerts without spam", body: "Email, Telegram and Discord alerts carry a summary and a diff link. Repeated content is deduplicated, and there is an optional daily digest." },
  { title: "Timeline & dashboard", body: "A per-page version timeline, plus a dashboard with last checked, last changed and an OK / error / blocked status." },
];

async function landingStats(): Promise<{ pages: number; changes: number }> {
  try {
    const [pages, changes] = await Promise.all([db.target.count(), db.snapshot.count()]);
    return { pages, changes };
  } catch {
    return { pages: 0, changes: 0 };
  }
}

export default async function LandingPage() {
  const [userId, stats] = await Promise.all([currentUserId().catch(() => null), landingStats()]);
  const signedIn = Boolean(userId);

  return (
    <div className="frame landing">
      <GridLines />
      <SiteHeader variant="marketing" signedIn={signedIn} />
      <Hero pagesWatched={stats.pages} changesCaught={stats.changes} signedIn={signedIn} />

      <section className="section" id="features">
        <div className="section-head">
          <div>
            <p className="eyebrow">Core</p>
            <h2 className="section-title">Everything a change monitor needs.</h2>
          </div>
          <p className="sub" style={{ maxWidth: 420 }}>
            Built as a Next.js app plus a Node worker running Playwright, BullMQ and Postgres.
          </p>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <article className="feature" key={f.title}>
              <span className="idx">{String(i + 1).padStart(2, "0")}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="design">
        <div className="section-head" id="noise">
          <div>
            <p className="eyebrow">Design Questions</p>
            <h2 className="section-title">How Driftwatch stays quiet and polite.</h2>
          </div>
        </div>
        <div className="qa-grid">
          <article className="qa">
            <h3><span>01</span>Is a site outage or CAPTCHA a change?</h3>
            <ul>
              <li>No. Each render is classified first: HTTP 5xx, timeouts and empty pages are <b>ERROR</b>; 401/403/429, robots.txt denials and CAPTCHA or Cloudflare challenges are <b>BLOCKED</b>.</li>
              <li>Only an OK render is compared, so outages and bot walls update the status on the dashboard and never create a snapshot or a change alert.</li>
            </ul>
          </article>
          <article className="qa">
            <h3><span>02</span>If 200 users watch the same URL, is it fetched 200 times?</h3>
            <ul>
              <li>No. URLs are normalised (host case, tracking params, fragments, query order) into one shared <b>Target</b>.</li>
              <li>Every monitor that is due rides on a single render. Each user&apos;s own selectors, noise rules and sensitivity are applied to that shared capture.</li>
              <li>A per-target BullMQ job id stops duplicate jobs from being queued.</li>
            </ul>
          </article>
          <article className="qa">
            <h3><span>03</span>How to avoid endless alerts on pages that differ on every load?</h3>
            <ul>
              <li>Noise is masked before hashing: timestamps, counters and tokens in the text; ads and carousels in the DOM.</li>
              <li>A detected change must survive a second render. Lines that differ between the two renders are learned as volatile and ignored from then on.</li>
              <li>A sensitivity threshold skips tiny edits, and a dedupe key (monitor + content hash + channel + day) caps A/B flip-flopping at one alert per state per day.</li>
            </ul>
          </article>
          <article className="qa">
            <h3><span>04</span>How to avoid hammering a site with requests?</h3>
            <ul>
              <li>The interval floor is 15 min, and URLs are shared, so each URL gets at most one render per cycle.</li>
              <li>A Redis lock allows one render per host every 10 s across all workers. There is also a global rate limit and a concurrency cap.</li>
              <li>robots.txt is respected. 429 responses honour Retry-After, and repeated failures back off exponentially (up to 6 h).</li>
            </ul>
          </article>
        </div>
      </section>

      <footer className="site-footer">
        <span>Driftwatch: Website Change Detector</span>
        <span>Public pages only · No stored credentials</span>
      </footer>
    </div>
  );
}
