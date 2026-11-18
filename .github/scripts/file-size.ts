import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { MAX_FILE_LINES, isOurPath } from "./settings.ts";

export function checkFile(path: string, source: string): string[] {
  if (!isOurPath(path) || !/\.(?:ts|js|mjs|sh|yml)$/.test(path)) return [];
  const lines = source === "" ? 0 : source.split("\n").length - Number(source.endsWith("\n"));
  return lines > MAX_FILE_LINES ? [`${path}: ${lines} lines (max ${MAX_FILE_LINES})`] : [];
}

if (import.meta.main) {
  const paths = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(isOurPath);
  const errors = paths.flatMap((path) => checkFile(path, readFileSync(path, "utf8")));
  for (const error of errors) console.log(error);
  console.log(`${errors.length} violations`);
  process.exitCode = errors.length ? 1 : 0;
}
