import { posix } from "node:path";
import { KRATOS_BASE_MODULES, KRATOS_ENTRY, KRATOS_ROOT, UPSTREAM_IMPORTABLE, UPSTREAM_SEAM_IMPORTERS } from "../settings.ts";

export type Rule = "upstream-into-kratos" | "kratos-into-upstream" | "module-internals" | "sideways" | "upward" | "outside-module";
export type Violation = { rule: Rule; file: string; specifier?: string };
export type BaselineEntry = { violation: string; reason: string };

const IMPORT = /(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;

export const isScanned = (path: string) => path.startsWith("src/") && /\.tsx?$/.test(path) && !path.endsWith(".d.ts");
export const isTest = (path: string) => /(?:^|\/)(?:tests|__tests__)\//.test(path) || /\.(?:test|spec)\.tsx?$/.test(path);
const inKratos = (key: string) => key === KRATOS_ROOT || key.startsWith(`${KRATOS_ROOT}/`);

export function importSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT)].map((match) => match[1] ?? match[2] ?? match[3]);
}

// Repo path of a relative import without its extension; packages resolve to undefined.
export function resolveImport(importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  return posix.normalize(posix.join(posix.dirname(importer), specifier)).replace(SOURCE_EXT, "");
}

// A folder and its index.ts are the same module contract.
const moduleKey = (path: string) => path.replace(SOURCE_EXT, "").replace(/\/index$/, "");

function place(key: string): { module: string; inside: boolean; layer: number } {
  if (key === KRATOS_ROOT) return { module: "", inside: false, layer: 2 };
  const [module, ...rest] = key.slice(KRATOS_ROOT.length + 1).split("/");
  return { module, inside: rest.length > 0, layer: (KRATOS_BASE_MODULES as readonly string[]).includes(module) ? 0 : 1 };
}

export function judgeImport(importer: string, specifier: string): Rule | undefined {
  const target = resolveImport(importer, specifier);
  if (target === undefined) return undefined;
  const key = moduleKey(target);
  if (!inKratos(importer)) {
    if (!inKratos(key)) return undefined;
    return (UPSTREAM_SEAM_IMPORTERS as readonly string[]).includes(importer) && key === KRATOS_ROOT ? undefined : "upstream-into-kratos";
  }
  if (isTest(importer)) return undefined;
  if (!inKratos(key)) {
    if (!target.startsWith("src/")) return undefined;
    return UPSTREAM_IMPORTABLE.some((prefix) => target.startsWith(prefix)) ? undefined : "kratos-into-upstream";
  }
  const from = place(moduleKey(importer));
  const to = place(key);
  if (from.module === to.module) return undefined;
  if (to.inside) return "module-internals";
  if (to.layer > from.layer) return "upward";
  if (to.layer === 1 && from.layer === 1) return "sideways";
  return undefined;
}

// Only the entry file, base root files and test files may sit directly in src/kratos.
export function outsideModule(path: string): boolean {
  if (!path.startsWith(`${KRATOS_ROOT}/`) || path === KRATOS_ENTRY || isTest(path)) return false;
  const rest = path.slice(KRATOS_ROOT.length + 1);
  return !rest.includes("/") && !(KRATOS_BASE_MODULES as readonly string[]).includes(rest.replace(SOURCE_EXT, ""));
}

export function scanFile(path: string, source: string): Violation[] {
  const found: Violation[] = outsideModule(path) ? [{ rule: "outside-module", file: path }] : [];
  for (const specifier of importSpecifiers(source)) {
    const rule = judgeImport(path, specifier);
    if (rule) found.push({ rule, file: path, specifier });
  }
  return found;
}

export const violationId = (v: Violation) => `${v.rule}: ${v.file}${v.specifier ? ` -> ${v.specifier}` : ""}`;

export function compareBaseline(found: Violation[], baseline: BaselineEntry[]): { fresh: string[]; stale: string[] } {
  const ids = new Set(found.map(violationId));
  const known = new Set(baseline.map((entry) => entry.violation));
  return { fresh: [...ids].filter((id) => !known.has(id)), stale: [...known].filter((id) => !ids.has(id)) };
}
