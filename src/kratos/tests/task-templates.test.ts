import { test } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher } from "undici";

process.env.CLICKUP_API_KEY = "test-key";
process.env.CLICKUP_TEAM_ID = "team1";
process.env.CLICKUP_MCP_MODE = "write";

type Reply = { status?: number; body: any };
type Seen = { method: string; path: string; body?: string };

const template = (id: string, name: string) => ({ id, name });

let clearCache: () => void = () => {};

// Serves template pages in order, then the create replies, and records every request.
function mockClickUp(pages: Reply[], creates: Reply[] = []) {
  clearCache();
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  const seen: Seen[] = [];
  const pool = agent.get("https://api.clickup.com");
  for (const page of pages) {
    pool
      .intercept({ path: (p) => p.startsWith("/api/v2/team/team1/taskTemplate?"), method: "GET" })
      .reply(page.status ?? 200, (req) => {
        seen.push({ method: "GET", path: req.path });
        return page.body;
      });
  }
  for (const create of creates) {
    pool
      .intercept({ path: (p) => p.startsWith("/api/v2/list/"), method: "POST" })
      .reply(create.status ?? 200, (req) => {
        seen.push({ method: "POST", path: req.path, body: String(req.body) });
        return create.body;
      });
  }
  return { agent, seen };
}

async function loadTools() {
  const { registerKratosToolsRead, registerKratosToolsWrite } = await import("../index");
  clearCache = (await import("../task-templates")).clearTemplatePageCache;
  clearCache();
  const tools: Record<string, any> = {};
  const server = { tool: (name: string, ...rest: any[]) => (tools[name] = rest[rest.length - 1]) } as any;
  registerKratosToolsRead(server);
  registerKratosToolsWrite(server);
  return tools;
}

const pageOf = (path: string) => new URLSearchParams(path.split("?")[1]).get("page");

test("getTaskTemplates prints template_id and name of page 0 by default", async () => {
  const { agent, seen } = mockClickUp([{ body: { templates: [template("t1", "Story card"), template("t2", "Bug")] } }]);
  const { getTaskTemplates } = await loadTools();
  const text = (await getTaskTemplates({})).content[0].text;
  assert.equal(pageOf(seen[0].path), "0");
  assert.match(text, /- Story card \(template_id: t1\)/);
  assert.match(text, /- Bug \(template_id: t2\)/);
  await agent.close();
});

test("getTaskTemplates by name pages on to a case-insensitive match on page 1", async () => {
  const { agent, seen } = mockClickUp([
    { body: { templates: [template("t1", "Bug")] } },
    { body: { templates: [template("t9", "Story Card")] } },
  ]);
  const { getTaskTemplates } = await loadTools();
  const text = (await getTaskTemplates({ name: "story card" })).content[0].text;
  assert.deepEqual(seen.map((s) => pageOf(s.path)), ["0", "1"]);
  assert.equal(text, "- Story Card (template_id: t9)");
  await agent.close();
});

test("getTaskTemplates by name with no match lists the names seen", async () => {
  const { agent, seen } = mockClickUp([
    { body: { templates: [template("t1", "Bug")] } },
    { body: { templates: [] } },
  ]);
  const { getTaskTemplates } = await loadTools();
  const text = (await getTaskTemplates({ name: "Story card" })).content[0].text;
  assert.equal(seen.length, 2);
  assert.match(text, /No task template named "Story card"/);
  assert.match(text, /- Bug \(template_id: t1\)/);
  await agent.close();
});

test("getTaskTemplates with an empty first page says there are none", async () => {
  const { agent } = mockClickUp([{ body: { templates: [] } }]);
  const { getTaskTemplates } = await loadTools();
  assert.equal((await getTaskTemplates({ page: 0 })).content[0].text, "No task templates.");
  await agent.close();
});

test("getTaskTemplates by name in an empty workspace says there are none", async () => {
  const { agent } = mockClickUp([{ body: { templates: [] } }]);
  const { getTaskTemplates } = await loadTools();
  assert.equal((await getTaskTemplates({ name: "Bug" })).content[0].text, "No task templates.");
  await agent.close();
});

test("getTaskTemplates by name stops after TEMPLATE_SEARCH_MAX_PAGES pages", async () => {
  const { TEMPLATE_SEARCH_MAX_PAGES } = await import("../task-templates/settings");
  const pages = Array.from({ length: TEMPLATE_SEARCH_MAX_PAGES }, (_, i) => ({ body: { templates: [template(`t${i}`, `T${i}`)] } }));
  const { agent, seen } = mockClickUp(pages);
  const { getTaskTemplates } = await loadTools();
  const text = (await getTaskTemplates({ name: "missing" })).content[0].text;
  assert.equal(seen.length, TEMPLATE_SEARCH_MAX_PAGES);
  assert.match(text, /Templates seen:/);
  await agent.close();
});

test("createTaskFromTemplate by id posts the name and prints the new task", async () => {
  const { agent, seen } = mockClickUp([], [{ body: { id: "new1" } }]);
  const { createTaskFromTemplate } = await loadTools();
  const text = (await createTaskFromTemplate({ list_id: "L1", name: "S336", template_id: "t1" })).content[0].text;
  assert.equal(seen[0].path, "/api/v2/list/L1/taskTemplate/t1");
  assert.deepEqual(JSON.parse(seen[0].body!), { name: "S336" });
  assert.match(text, /task_id: new1/);
  assert.match(text, /url: https:\/\/app\.clickup\.com\/t\/new1/);
  await agent.close();
});

test("createTaskFromTemplate by name resolves the template first", async () => {
  const { agent, seen } = mockClickUp([{ body: { templates: [template("t7", "Story card")] } }], [{ body: {} }]);
  const { createTaskFromTemplate } = await loadTools();
  const text = (await createTaskFromTemplate({ list_id: "L1", name: "S336", template_name: "STORY CARD" })).content[0].text;
  assert.equal(seen[1].path, "/api/v2/list/L1/taskTemplate/t7");
  assert.equal(text, "Task created from t7");
  await agent.close();
});

test("createTaskFromTemplate with an unknown name sends no POST", async () => {
  const { agent, seen } = mockClickUp([{ body: { templates: [template("t1", "Bug")] } }, { body: { templates: [] } }]);
  const { createTaskFromTemplate } = await loadTools();
  const text = (await createTaskFromTemplate({ list_id: "L1", name: "S336", template_name: "Story card" })).content[0].text;
  assert.ok(seen.every((s) => s.method === "GET"));
  assert.match(text, /- Bug \(template_id: t1\)/);
  await agent.close();
});

test("createTaskFromTemplate needs exactly one selector and sends nothing otherwise", async () => {
  const { agent, seen } = mockClickUp([]);
  const { createTaskFromTemplate } = await loadTools();
  for (const args of [{}, { template_id: "t1", template_name: "Bug" }]) {
    const result = await createTaskFromTemplate({ list_id: "L1", name: "S336", ...args });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /exactly one of template_id or template_name/);
  }
  assert.equal(seen.length, 0);
  await agent.close();
});

test("createTaskFromTemplate passes ClickUp's 404 answer through", async () => {
  const { agent } = mockClickUp([], [{ status: 404, body: { err: "List not found", ECODE: "SUBCAT_016" } }]);
  const { createTaskFromTemplate } = await loadTools();
  const result = await createTaskFromTemplate({ list_id: "nope", name: "S336", template_id: "t1" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /HTTP 404 \(SUBCAT_016\): List not found/);
  await agent.close();
});

test("repeated name lookups reuse cached template pages", async () => {
  const { agent, seen } = mockClickUp(
    [{ body: { templates: [template("t1", "Bug")] } }, { body: { templates: [template("t7", "Story card")] } }],
    [{ body: { id: "a" } }, { body: { id: "b" } }]
  );
  const { createTaskFromTemplate } = await loadTools();
  for (const name of ["S1", "S2"]) {
    await createTaskFromTemplate({ list_id: "L1", name, template_name: "Story card" });
  }
  assert.deepEqual(seen.map((s) => s.method), ["GET", "GET", "POST", "POST"]);
  await agent.close();
});

test("a failed template page is not cached", async () => {
  const { agent, seen } = mockClickUp([
    { status: 500, body: { err: "boom" } },
    { body: { templates: [template("t1", "Bug")] } },
  ]);
  const { getTaskTemplates } = await loadTools();
  assert.equal((await getTaskTemplates({})).isError, true);
  assert.match((await getTaskTemplates({})).content[0].text, /- Bug \(template_id: t1\)/);
  assert.equal(seen.length, 2);
  await agent.close();
});
