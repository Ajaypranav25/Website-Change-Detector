export const BOT_USER_AGENT = "DriftwatchBot/0.1 (+website change monitor)";
const BOT_TOKEN = "driftwatchbot";

interface Group {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

function parseGroups(robotsTxt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const [, key, value] = match;
    const field = key.toLowerCase();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (current && (field === "allow" || field === "disallow")) {
      if (value) current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith("$");
  const pattern = rulePath
    .replace(/\$$/, "")
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** Longest-match robots.txt evaluation for our bot (falls back to the `*` group). */
export function isAllowedByRobots(robotsTxt: string, url: string): boolean {
  const groups = parseGroups(robotsTxt);
  const group =
    groups.find((g) => g.agents.some((a) => a !== "*" && BOT_TOKEN.includes(a))) ??
    groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  const { pathname, search } = new URL(url);
  const path = pathname + search;
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of group.rules) {
    if (!ruleMatches(rule.path, path)) continue;
    const length = rule.path.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length };
  }
  return best ? best.allow : true;
}
