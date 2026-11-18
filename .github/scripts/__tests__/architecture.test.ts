import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { compareBaseline, importSpecifiers, judgeImport, outsideModule, scanFile, violationId } from "../architecture/index.ts";

describe("import specifiers", () => {
  test("reads static, re-export, side-effect, dynamic and require forms", () => {
    const source = [
      'import { a } from "./a";',
      "import type {\n  B,\n} from '../b';",
      'export { c } from "./c";',
      'import "./d";',
      'const e = await import("./e");',
      'const f = require("./f");',
      'import { z } from "zod";',
    ].join("\n");
    expect(importSpecifiers(source)).toEqual(["./a", "../b", "./c", "./d", "./e", "./f", "zod"]);
  });
});

describe("upstream edges", () => {
  test.each([
    ["src/index.ts", "./kratos/index.js", undefined],
    ["src/index.ts", "./kratos", undefined],
    ["src/index.ts", "./kratos/list-by-status", "upstream-into-kratos"],
    ["src/tools/task-tools.ts", "../kratos/index", "upstream-into-kratos"],
    ["src/tools/task-tools.ts", "../kratos/clickup-api", "upstream-into-kratos"],
    ["src/tools/task-tools.ts", "../shared/config", undefined],
    ["src/tools/task-tools.ts", "../kratosx/a", undefined],
    ["src/tests/addComment.test.ts", "../tools/task-tools", undefined],
  ])("%s imports %s → %p", (importer, specifier, rule) => expect(judgeImport(importer, specifier)).toBe(rule));
});

describe("our edges", () => {
  test.each([
    ["src/kratos/clickup-api/request.ts", "../../shared/config", undefined],
    ["src/kratos/clickup-api/request.ts", "../../tools/task-tools", "kratos-into-upstream"],
    ["src/kratos/a/x.ts", "../../index", "kratos-into-upstream"],
    ["src/kratos/a/x.ts", "../../clickup-text", "kratos-into-upstream"],
    ["src/kratos/a/x.ts", "./y", undefined],
    ["src/kratos/a/x.ts", "../clickup-api", undefined],
    ["src/kratos/a/x.ts", "../clickup-api/request", "module-internals"],
    ["src/kratos/a/x.ts", "../settings", undefined],
    ["src/kratos/a/x.ts", "../b/y", "module-internals"],
    ["src/kratos/a/x.ts", "../b", "sideways"],
    ["src/kratos/a/x.ts", "../list-by-status", "sideways"],
    ["src/kratos/a/x.ts", "..", "upward"],
    ["src/kratos/clickup-api/x.ts", "../a", "upward"],
    ["src/kratos/clickup-api/x.ts", "../settings", undefined],
    ["src/kratos/index.ts", "./a", undefined],
    ["src/kratos/index.ts", "./a/x", "module-internals"],
    ["src/kratos/tests/a.test.ts", "../../tools/doc-tools", undefined],
    ["src/kratos/a/tests/x.test.ts", "../../b/y", undefined],
  ])("%s imports %s → %p", (importer, specifier, rule) => expect(judgeImport(importer, specifier)).toBe(rule));
});

describe("module folders", () => {
  test.each([
    ["src/kratos/index.ts", false],
    ["src/kratos/settings.ts", false],
    ["src/kratos/list-by-status.ts", true],
    ["src/kratos/a/x.ts", false],
    ["src/kratos/tests/a.test.ts", false],
    ["src/tools/task-tools.ts", false],
  ])("%s outside a module → %p", (path, outside) => expect(outsideModule(path)).toBe(outside));
});

describe("baseline", () => {
  const found = scanFile("src/kratos/a/x.ts", 'import { y } from "../b/y";\nimport { c } from "../../shared/config";\n');
  test("an unknown violation is new, a fixed entry is stale", () => {
    expect(found.map(violationId)).toEqual(["module-internals: src/kratos/a/x.ts -> ../b/y"]);
    const { fresh, stale } = compareBaseline(found, [{ violation: "sideways: src/kratos/c/z.ts -> ../d", reason: "old" }]);
    expect(fresh).toEqual(["module-internals: src/kratos/a/x.ts -> ../b/y"]);
    expect(stale).toEqual(["sideways: src/kratos/c/z.ts -> ../d"]);
  });
  test("a listed violation passes", () => {
    const { fresh } = compareBaseline(found, [{ violation: violationId(found[0]), reason: "known" }]);
    expect(fresh).toEqual([]);
  });
});

test("the current tree passes against its baseline", () => {
  expect(() => execFileSync("bun", [".github/scripts/architecture/cli.ts"], { encoding: "utf8" })).not.toThrow();
});

test("the architecture job runs on every PR under its exact name", () => {
  const workflow = readFileSync(".github/workflows/architecture.yml", "utf8");
  expect(workflow).toMatch(/^jobs:\n(?:\s+#.*\n)?  architecture:\n/m);
  expect(workflow).not.toMatch(/paths(?:-ignore)?:|\bif:/);
  expect(workflow).toContain("runs-on: ubuntu-latest");
  expect(workflow).not.toContain("secrets.");
});
