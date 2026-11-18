import { afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher } from "undici";

let tools: Record<string, (input: any) => Promise<any>>;
let agent: MockAgent;

interface Captured {
  path: string;
  method: string;
  body: unknown;
}

// Any request without an interceptor fails through disableNetConnect, so a count of one is exact.
function capture(method: string, status = 200, data: unknown = {}) {
  const seen: Captured[] = [];
  agent
    .get("https://api.clickup.com")
    .intercept({ path: (p: string) => p.startsWith("/api/v2/task/"), method })
    .reply((opts) => {
      seen.push({ path: opts.path, method: opts.method, body: opts.body });
      return { statusCode: status, data: data as any };
    });
  return seen;
}

before(async () => {
  process.env.CLICKUP_API_KEY = "test-key";
  process.env.CLICKUP_TEAM_ID = "team1";
  const { registerKratosToolsWrite } = await import("../index");
  tools = {};
  const serverStub = {
    tool: (name: string, _desc: string, _schema: any, _opts: any, handler: any) => {
      tools[name] = handler;
    },
  } as any;
  registerKratosToolsWrite(serverStub);
});

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  agent.assertNoPendingInterceptors();
  await agent.close();
});

test("addTaskDependency waits_on posts depends_on on task_id", async () => {
  const seen = capture("POST");
  const result = await tools.addTaskDependency({ task_id: "a1", other_task_id: "b2", direction: "waits_on" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].path, "/api/v2/task/a1/dependency");
  assert.deepEqual(JSON.parse(String(seen[0].body)), { depends_on: "b2" });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /^task a1 waits on b2: added \(https:\/\/app\.clickup\.com\/t\/a1, https:\/\/app\.clickup\.com\/t\/b2\)$/);
});

test("addTaskDependency blocks posts depends_on on other_task_id", async () => {
  const seen = capture("POST");
  const result = await tools.addTaskDependency({ task_id: "a1", other_task_id: "b2", direction: "blocks" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].path, "/api/v2/task/b2/dependency");
  assert.deepEqual(JSON.parse(String(seen[0].body)), { depends_on: "a1" });
  assert.match(result.content[0].text, /^task b2 waits on a1: added/);
});

test("deleteTaskDependency waits_on deletes with depends_on only", async () => {
  const seen = capture("DELETE");
  const result = await tools.deleteTaskDependency({ task_id: "a1", other_task_id: "b2", direction: "waits_on" });
  assert.equal(seen.length, 1);
  const url = new URL(seen[0].path, "https://api.clickup.com");
  assert.equal(url.pathname, "/api/v2/task/a1/dependency");
  assert.deepEqual([...url.searchParams.entries()], [["depends_on", "b2"]]);
  assert.match(result.content[0].text, /^task a1 waits on b2: removed/);
});

test("deleteTaskDependency blocks deletes on the other task", async () => {
  const seen = capture("DELETE");
  const result = await tools.deleteTaskDependency({ task_id: "a1", other_task_id: "b2", direction: "blocks" });
  assert.equal(seen.length, 1);
  const url = new URL(seen[0].path, "https://api.clickup.com");
  assert.equal(url.pathname, "/api/v2/task/b2/dependency");
  assert.deepEqual([...url.searchParams.entries()], [["depends_on", "a1"]]);
  assert.match(result.content[0].text, /^task b2 waits on a1: removed/);
});

test("a 400 reply is printed as an error and not retried", async (t) => {
  t.mock.method(console, "error", () => {});
  const seen = capture("POST", 400, { err: "Dependency would create a cycle", ECODE: "DEP_001" });
  const result = await tools.addTaskDependency({ task_id: "a1", other_task_id: "b2", direction: "waits_on" });
  assert.equal(seen.length, 1);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^Error adding task dependency: .*HTTP 400 \(DEP_001\): Dependency would create a cycle/);
});

test("custom task IDs are resolved to generated IDs before the dependency call", async () => {
  const lookups: string[] = [];
  agent
    .get("https://api.clickup.com")
    .intercept({ path: (p: string) => p.startsWith("/api/v2/task/ENG-"), method: "GET" })
    .reply((opts) => {
      lookups.push(opts.path);
      return { statusCode: 200, data: { id: opts.path.includes("ENG-1") ? "gen1" : "gen2" } };
    })
    .times(2);
  const seen = capture("POST");
  const result = await tools.addTaskDependency({ task_id: "ENG-1", other_task_id: "ENG-2", direction: "waits_on" });
  assert.equal(lookups.length, 2);
  assert.ok(lookups.every((p) => p.includes("custom_task_ids=true") && p.includes("team_id=team1")));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].path, "/api/v2/task/gen1/dependency");
  assert.deepEqual(JSON.parse(String(seen[0].body)), { depends_on: "gen2" });
  assert.match(result.content[0].text, /^task gen1 waits on gen2: added/);
});
