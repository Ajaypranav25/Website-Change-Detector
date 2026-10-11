# Driftwatch: Website Change Detector

Monitors public web pages and alerts you to meaningful changes while ignoring noise.

- **Web app:** Next.js 15 (App Router) with a dark, Cortexa-style UI. The landing hero has an interactive star: the arm nearest the cursor shifts colour as you move.
- **Worker:** Node, BullMQ on Redis, and Playwright (headless Chromium).
- **Storage:** PostgreSQL via Prisma. Captured HTML and screenshots live in `DATA_DIR`.

## Quick start

```bash
cp .env.example .env            # then set AUTH_SECRET (command in the file)
docker compose up -d            # Postgres + Redis
npm install
npx playwright install chromium
npm run db:push
npm run dev                     # web app → http://localhost:3000
npm run worker                  # scheduler + render/alert workers (second terminal)
```

`npm test` runs the unit tests and `npm run test:coverage` adds coverage.

## Features (core requirements)

| # | Requirement | Where |
|---|---|---|
| 1 | Add URL, name and interval (15 min to 24 h); pages are rendered in headless Chromium | `src/app/monitors/new`, `src/worker/renderer.ts` |
| 2 | Scheduler and job queue with timeouts and retries; public pages only, no credentials | `src/worker/scheduler.ts`, `src/worker/index.ts`, `src/lib/url.ts` |
| 3 | Each check saves text and a screenshot; a snapshot is stored only when the hash changes | `src/worker/processor.ts`, `src/lib/detect.ts` |
| 4 | Noise filters (timestamps, counters, ads, banners, tokens) and a sensitivity setting | `src/lib/noise.ts`, `src/lib/extract.ts` |
| 5 | Visual picker for regions to watch or ignore, saved as CSS selectors | `src/components/RegionPicker.tsx`, `src/lib/selector.ts` |
| 6 | Text diff, highlighted screenshot diff, side-by-side compare of any two versions | `src/app/monitors/[id]/compare`, `src/lib/imageDiff.ts` |
| 7 | Email, Telegram and Discord alerts with summary and diff link; no duplicates; daily digest | `src/worker/alerts.ts`, `src/lib/alerts/*` |
| 8 | Version timeline, plus a dashboard with last checked, last changed and status | `src/app/monitors/[id]`, `src/app/dashboard` |

## Design questions

**1. Is a site outage or CAPTCHA a change?**
No. Every render is classified before comparison (`src/lib/blocked.ts`). Timeouts, 5xx responses and empty pages are `ERROR`. Responses of 401, 403 and 429, robots.txt denials, and CAPTCHA or Cloudflare challenges are `BLOCKED`. Only `OK` renders are compared, so an outage changes the dashboard status but never creates a snapshot or a change alert.

**2. If 200 users watch the same URL, is it fetched 200 times?**
No. URLs are normalised (host case, fragments, tracking params, query order) into one shared `Target`. One render per target serves every due monitor, and each monitor applies its own selectors, noise rules and sensitivity to that shared capture. A per-target BullMQ `jobId` prevents duplicate queued jobs.

**3. How do you avoid endless alerts on pages that differ on every load?**
Noise is masked before hashing: timestamps, counters and tokens in the text, and ads and carousels in the DOM. A detected change must also survive a second, independent render; lines that differ between the two renders are learned as volatile and ignored from then on. A sensitivity threshold drops tiny edits. Finally, the alert dedupe key (`monitor + content hash + channel + day`, unique in the database) means content that flips between A and B alerts at most once per state per day. A genuine back-and-forth, such as in stock and out of stock, still alerts on later days.

**4. How do you avoid hammering a site with requests?**
- The interval floor is 15 minutes, and shared targets mean one render per URL per cycle.
- A Redis lock allows one render per host every 10 s across all workers, alongside a global rate limit and a concurrency cap.
- robots.txt is honoured (cached for 24 h). A 429 response respects `Retry-After`, and repeated failures back off exponentially up to 6 h.
- Manual "Check now" requests are limited to one per monitor every 2 minutes.

## Alert channels

| Channel | Setup |
|---|---|
| Email | Set `SMTP_URL` and `SMTP_FROM`. Without them, alerts are recorded as *skipped*. |
| Discord | Each user pastes a webhook URL in **Alerts**. |
| Telegram | Set `TELEGRAM_BOT_TOKEN` on the server; each user enters their chat ID. |

## Security notes

- **SSRF guard:** only http(s) URLs are allowed, and hosts must resolve to public IPs. This is checked on create and on every top-level navigation, and subrequests to literal private IPs or localhost are aborted.
- **Picker isolation:** captured pages are shown inert, with scripts, event handlers and meta refreshes stripped, in a sandboxed iframe without `allow-scripts`.
- **Sessions:** HS256 JWTs in an httpOnly, SameSite=Lax cookie. Mutating API calls also check the request origin.
- **Rate limits:** applied to signup, login (per IP and per account), monitor creation and manual checks. `X-Forwarded-For` is only trusted with `TRUST_PROXY=1`, and then only the hop your proxy appended is used.
- **Picker CSP:** the inert copy also carries a `script-src 'none'` CSP.
- **Subrequests:** every request the headless browser makes, including subresources and iframes, has its host resolved and must be public. WebSockets are blocked, and robots.txt fetches never follow redirects.

### Known limitations

- **DNS rebinding:** a hostname that resolves publicly during the check and privately when Chromium connects can still slip through. Production deployments should run the worker behind an egress proxy that pins validated IPs (Smokescreen or similar), or a firewall that drops RFC1918 and link-local traffic.
- **Telegram chat IDs** are not ownership-verified; a `/start <token>` handshake with the bot would close that gap.
- **Data retention:** captures no snapshot references are pruned after 1 h, but versions are kept forever.
