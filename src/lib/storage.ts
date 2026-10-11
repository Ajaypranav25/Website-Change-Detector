import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

const SAFE_NAME = /^[\w.-]+$/;

/** Resolves a stored file name inside DATA_DIR, refusing anything that could escape it. */
export function dataPath(kind: "captures" | "diffs", name: string): string {
  if (!SAFE_NAME.test(name) || name.includes("..")) throw new Error("Invalid storage name");
  return path.join(config.dataDir, kind, name);
}

export async function saveFile(kind: "captures" | "diffs", name: string, data: Buffer | string): Promise<string> {
  const target = dataPath(kind, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return name;
}

export async function loadFile(kind: "captures" | "diffs", name: string): Promise<Buffer | null> {
  try {
    return await readFile(dataPath(kind, name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
