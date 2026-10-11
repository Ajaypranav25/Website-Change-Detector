import { type ChangeObject, diffLines } from "diff";

function terminated(text: string): string {
  return text === "" || text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * Line diff that treats every line as newline-terminated, so an unchanged
 * final line is not reported as removed and re-added.
 */
export function lineDiff(before: string, after: string): ChangeObject<string>[] {
  return diffLines(terminated(before), terminated(after));
}
