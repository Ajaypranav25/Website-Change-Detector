const SAFE_IDENT = /^[A-Za-z_][\w-]*$/;
/** Class names that look generated (hashes, long numbers) make brittle selectors. */
const GENERATED_CLASS = /\d{3,}|^css-|^sc-|__[a-z0-9]{5,}$/i;
const MAX_DEPTH = 8;

function escapeIdent(value: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/([^\w-])/g, "\\$1");
}

function isUnique(doc: Document, selector: string): boolean {
  try {
    return doc.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/** Builds a short, stable CSS selector that uniquely identifies `el` within its document. */
export function buildSelector(el: Element): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  let current: Element | null = el;

  for (let depth = 0; current && current.tagName !== "HTML" && depth < MAX_DEPTH; depth++) {
    if (current.id && SAFE_IDENT.test(current.id) && isUnique(doc, `#${escapeIdent(current.id)}`)) {
      parts.unshift(`#${escapeIdent(current.id)}`);
      return parts.join(" > ");
    }
    let part = current.tagName.toLowerCase();
    const classes = [...current.classList].filter((c) => SAFE_IDENT.test(c) && !GENERATED_CLASS.test(c)).slice(0, 2);
    part += classes.map((c) => `.${escapeIdent(c)}`).join("");

    const parent: Element | null = current.parentElement;
    if (parent) {
      const tag = current.tagName;
      const siblings = [...parent.children].filter((c) => c.tagName === tag);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    const candidate = parts.join(" > ");
    if (isUnique(doc, candidate)) return candidate;
    current = parent;
  }
  return parts.join(" > ");
}
