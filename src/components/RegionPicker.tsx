"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { buildSelector } from "@/lib/selector";

type Mode = "watch" | "ignore";

interface Props {
  monitorId: string;
  captureId: string;
  initialWatch: string[];
  initialIgnore: string[];
}

const PICKER_STYLE = `
  [data-dw-hover] { outline: 2px dashed #4b6bff !important; outline-offset: 2px !important; cursor: crosshair !important; background-color: rgba(27,70,255,.08) !important; }
  [data-dw-watch] { outline: 3px solid #3ddc97 !important; outline-offset: 2px !important; background-color: rgba(61,220,151,.12) !important; }
  [data-dw-ignore] { outline: 3px solid #ff5d4f !important; outline-offset: 2px !important; background-color: rgba(255,93,79,.14) !important; }
  * { cursor: crosshair !important; }
`;

function markAll(doc: Document, attr: string, selectors: string[]): void {
  doc.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
  for (const s of selectors) {
    try {
      doc.querySelectorAll(s).forEach((el) => el.setAttribute(attr, ""));
    } catch {
      // invalid selector typed manually: skipped in preview, rejected on save
    }
  }
}

export function RegionPicker({ monitorId, captureId, initialWatch, initialIgnore }: Props) {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("watch");
  const [watch, setWatch] = useState(initialWatch);
  const [ignore, setIgnore] = useState(initialIgnore);
  const [manual, setManual] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    apiRequest<{ html: string }>(`/api/captures/${captureId}/page`)
      .then((d) => setHtml(d.html))
      .catch((err: Error) => setLoadError(err.message));
  }, [captureId]);

  const addSelector = useCallback((selector: string, target: Mode) => {
    const add = (list: string[]) => (list.includes(selector) ? list : [...list, selector]);
    if (target === "watch") {
      setWatch(add);
      setIgnore((l) => l.filter((s) => s !== selector));
    } else {
      setIgnore(add);
      setWatch((l) => l.filter((s) => s !== selector));
    }
  }, []);

  // Wire hover/click handlers once the inert copy has loaded
  const onFrameLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    const style = doc.createElement("style");
    style.textContent = PICKER_STYLE;
    doc.head.appendChild(style);
    let hovered: Element | null = null;
    doc.addEventListener("mouseover", (e) => {
      hovered?.removeAttribute("data-dw-hover");
      hovered = e.target instanceof doc.defaultView!.Element ? (e.target as Element) : null;
      if (hovered && hovered !== doc.body) hovered.setAttribute("data-dw-hover", "");
    });
    doc.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const el = e.target as Element;
        if (!el || el === doc.body || el === doc.documentElement) return;
        el.removeAttribute("data-dw-hover");
        addSelector(buildSelector(el), modeRef.current);
      },
      true,
    );
    doc.addEventListener("submit", (e) => e.preventDefault(), true);
  }, [addSelector]);

  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    markAll(doc, "data-dw-watch", watch);
    markAll(doc, "data-dw-ignore", ignore);
  }, [watch, ignore, html]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest(`/api/monitors/${monitorId}`, {
        method: "PATCH",
        body: JSON.stringify({ watchSelectors: watch, ignoreSelectors: ignore }),
      });
      setMessage({ ok: true, text: "Regions saved. They apply from the next check." });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const renderList = (list: string[], kind: Mode, setList: (fn: (l: string[]) => string[]) => void) => (
    <ul className="sel-list">
      {list.length === 0 && <li className="dim">{kind === "watch" ? "Whole page (nothing selected)" : "Nothing ignored"}</li>}
      {list.map((s) => (
        <li key={s} className={kind === "watch" ? "sel-watch" : "sel-ignore"}>
          <code>{s}</code>
          <button className="btn btn-sm" aria-label={`Remove ${s}`} onClick={() => setList((l) => l.filter((x) => x !== s))}>✕</button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="picker">
      <div>
        {loadError && <p className="form-error">{loadError}</p>}
        {!html && !loadError && <div className="empty-state">Loading captured page…</div>}
        {html && (
          <iframe
            ref={frameRef}
            className="picker-frame"
            title="Captured page (scripts disabled)"
            sandbox="allow-same-origin"
            srcDoc={html}
            onLoad={onFrameLoad}
          />
        )}
      </div>

      <aside className="panel panel-pad stack">
        <div>
          <span className="label">Click mode</span>
          <div className="tabs" role="group" aria-label="Click mode" style={{ marginTop: 8 }}>
            <button aria-pressed={mode === "watch"} onClick={() => setMode("watch")}>● Watch</button>
            <button aria-pressed={mode === "ignore"} onClick={() => setMode("ignore")}>✕ Ignore</button>
          </div>
          <p className="form-note" style={{ marginTop: 8 }}>
            Click an element in the page. Watch limits checks to those regions; Ignore removes regions such as sidebars or
            feeds.
          </p>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Watching</span>
          {renderList(watch, "watch", setWatch)}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Ignoring</span>
          {renderList(ignore, "ignore", setIgnore)}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) addSelector(manual.trim(), mode);
            setManual("");
          }}
        >
          <input className="input" placeholder="or type a CSS selector" value={manual} onChange={(e) => setManual(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" type="submit">Add</button>
        </form>
        <div className="row">
          <button className="btn btn-primary" onClick={save} disabled={busy}>Save Regions</button>
          {message && <span className={message.ok ? "toast" : "form-error"}>{message.text}</span>}
        </div>
      </aside>
    </div>
  );
}
