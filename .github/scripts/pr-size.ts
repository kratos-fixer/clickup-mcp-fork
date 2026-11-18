import { execFileSync } from "node:child_process";
import { CODE_LINES_PER_PR_LIMIT, LEDGER_FILE, isOurPath } from "./settings.ts";

export type FileChange = { path: string; additions: number; deletions: number };
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" });

export function parseNumstat(text: string): FileChange[] {
  return lines(text).map((row) => {
    const [added, deleted, path] = row.split("\t");
    return { path, additions: Number(added) || 0, deletions: Number(deleted) || 0 };
  });
}

function lines(text: string): string[] {
  return text.trim().split("\n").filter(Boolean);
}

// Only `seam` rows count: a `temporary` row is the author's own PR cherry-picked as written, 0 like a tag bump.
export function seamPaths(patchDiff: string): Set<string> {
  const paths = new Set<string>();
  for (const row of patchDiff.split("\n")) {
    if (!/^\+\|/.test(row)) continue;
    const cells = row.slice(1).split("|").map((cell) => cell.trim());
    if (cells[5] !== "seam") continue;
    for (const match of (cells[2] ?? "").matchAll(/`([^`]+)`/g)) paths.add(match[1].replace(/:[\d,-]+$/, ""));
  }
  return paths;
}

export function countCode(files: FileChange[], seams: Set<string>): number {
  return files.reduce((total, file) => {
    if (!isOurPath(file.path) && !seams.has(file.path)) return total;
    if (/\/(?:__tests__|tests|fixtures|__fixtures__)\//.test(file.path) || /\.(?:test|spec)\.[cm]?[jt]s$/.test(file.path))
      return total;
    if (/\.(?:md|json)$/.test(file.path)) return total;
    return total + file.additions + file.deletions;
  }, 0);
}

function main(): void {
  const [flag, range] = process.argv.slice(2);
  if (flag !== "--range" || !range?.includes("...")) throw new Error("usage: bun .github/scripts/pr-size.ts --range <base>...<head>");
  const files = parseNumstat(git("diff", "--numstat", range));
  const code = countCode(files, seamPaths(git("diff", range, "--", LEDGER_FILE)));
  console.log(`code ${code} / limit ${CODE_LINES_PER_PR_LIMIT}${code > CODE_LINES_PER_PR_LIMIT ? " over" : ""}`);
  if (code > CODE_LINES_PER_PR_LIMIT) process.exitCode = 1;
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 2;
  }
}
