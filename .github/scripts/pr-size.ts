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

function prFiles(pr: string): { files: FileChange[]; range: string } {
  const rows = execFileSync(
    "gh",
    ["api", "--paginate", `repos/{owner}/{repo}/pulls/${pr}/files`, "--jq", ".[] | {filename, additions, deletions}"],
    { encoding: "utf8" }
  );
  const files = lines(rows).map((row) => {
    const file = JSON.parse(row) as { filename: string; additions: number; deletions: number };
    return { path: file.filename, additions: file.additions, deletions: file.deletions };
  });
  const range = execFileSync(
    "gh",
    ["pr", "view", pr, "--json", "baseRefOid,headRefOid", "--jq", '[.baseRefOid,.headRefOid] | join("...")'],
    { encoding: "utf8" }
  ).trim();
  return { files, range };
}

function main(): void {
  const target = process.argv[2];
  if (!target) throw new Error("usage: bun .github/scripts/pr-size.ts <PR> | --range <base>...<head>");
  let files: FileChange[];
  let range: string;
  if (target === "--range") {
    range = process.argv[3];
    if (!range?.includes("...")) throw new Error("expected <base>...<head>");
    files = parseNumstat(git("diff", "--numstat", range));
  } else {
    if (!/^[1-9]\d*$/.test(target)) throw new Error("expected PR number");
    ({ files, range } = prFiles(target));
  }
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
