import { test } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher } from "undici";

process.env.CLICKUP_API_KEY = "test-key";
process.env.CLICKUP_TEAM_ID = "team1";

type Call = { method: string; path: string; body: any };

const checklist = {
  id: "c1",
  name: "Tasks",
  orderindex: 0,
  resolved: 1,
  unresolved: 1,
  items: [
    { id: "i2", name: "T2", orderindex: 1, resolved: false, parent: null },
    { id: "i1", name: "T1", orderindex: 0, resolved: true, parent: null },
  ],
};

const taskJson = {
  id: "task123",
  checklists: [
    {
      id: "c2",
      name: "Review",
      orderindex: 1,
      items: [{ id: "n1", name: "Nested", orderindex: 0, resolved: false, parent: "n0", children: [{ id: "n2", name: "Deep", orderindex: 1, resolved: true, parent: "n1" }] }],
    },
    checklist,
  ],
};

// Answers exactly one request and records it; any other request fails through disableNetConnect.
function mockOne(method: string, path: string, status: number, body: any) {
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  const calls: Call[] = [];
  agent
    .get("https://api.clickup.com")
    .intercept({ path, method })
    .reply(status, (request) => {
      calls.push({ method, path: request.path, body: request.body ? JSON.parse(String(request.body)) : undefined });
      return body;
    });
  return { agent, calls };
}

async function loadTools() {
  const { registerKratosToolsRead, registerKratosToolsWrite } = await import("../index");
  const tools: Record<string, any> = {};
  const server = { tool: (name: string, ...rest: any[]) => (tools[name] = rest[rest.length - 1]) } as any;
  registerKratosToolsRead(server);
  registerKratosToolsWrite(server);
  return tools;
}

const text = (result: any) => result.content[0].text as string;

test("getTaskChecklists prints checklists and flat items in order with ids and resolved counts", async () => {
  const { agent, calls } = mockOne("GET", "/api/v2/task/task123", 200, taskJson);
  const tools = await loadTools();
  const out = text(await tools.getTaskChecklists({ task_id: "task123" }));
  assert.equal(calls.length, 1);
  assert.equal(
    out,
    [
      "Checklist: Tasks (checklist_id: c1), 1 of 2 resolved",
      "- [x] T1 (item_id: i1, resolved: true)",
      "- [ ] T2 (item_id: i2, resolved: false)",
      "Checklist: Review (checklist_id: c2), 1 of 2 resolved",
      "- [ ] Nested (item_id: n1, resolved: false)",
      "- [x] Deep (item_id: n2, resolved: true)",
    ].join("\n")
  );
  await agent.close();
});

test("getTaskChecklists says so when the task has no checklists", async () => {
  const { agent } = mockOne("GET", "/api/v2/task/task123", 200, { id: "task123", checklists: [] });
  const tools = await loadTools();
  assert.equal(text(await tools.getTaskChecklists({ task_id: "task123" })), "No checklists.");
  await agent.close();
});

test("createChecklist posts the name to the task and prints the returned checklist", async () => {
  const { agent, calls } = mockOne("POST", "/api/v2/task/task123/checklist", 200, { checklist: { id: "c9", name: "Tasks", items: [] } });
  const tools = await loadTools();
  const out = text(await tools.createChecklist({ task_id: "task123", name: "Tasks" }));
  assert.deepEqual(calls, [{ method: "POST", path: "/api/v2/task/task123/checklist", body: { name: "Tasks" } }]);
  assert.equal(out, "Checklist: Tasks (checklist_id: c9), 0 of 0 resolved");
  await agent.close();
});

test("renameChecklist puts the new name on the checklist", async () => {
  const { agent, calls } = mockOne("PUT", "/api/v2/checklist/c1", 200, {});
  const tools = await loadTools();
  const out = text(await tools.renameChecklist({ checklist_id: "c1", name: "Steps" }));
  assert.deepEqual(calls, [{ method: "PUT", path: "/api/v2/checklist/c1", body: { name: "Steps" } }]);
  assert.match(out, /c1 renamed to Steps/);
  await agent.close();
});

test("deleteChecklist sends one DELETE to the checklist", async () => {
  const { agent, calls } = mockOne("DELETE", "/api/v2/checklist/c1", 200, {});
  const tools = await loadTools();
  const out = text(await tools.deleteChecklist({ checklist_id: "c1" }));
  assert.deepEqual(calls, [{ method: "DELETE", path: "/api/v2/checklist/c1", body: undefined }]);
  assert.match(out, /c1 deleted/);
  await agent.close();
});

test("createChecklistItem posts the name to the checklist items", async () => {
  const { agent, calls } = mockOne("POST", "/api/v2/checklist/c1/checklist_item", 200, { checklist });
  const tools = await loadTools();
  const out = text(await tools.createChecklistItem({ checklist_id: "c1", name: "T3" }));
  assert.deepEqual(calls, [{ method: "POST", path: "/api/v2/checklist/c1/checklist_item", body: { name: "T3" } }]);
  assert.match(out, /^Checklist: Tasks \(checklist_id: c1\)/);
  await agent.close();
});

test("editChecklistItem with only resolved sends only resolved", async () => {
  const { agent, calls } = mockOne("PUT", "/api/v2/checklist/c1/checklist_item/i2", 200, { checklist });
  const tools = await loadTools();
  await tools.editChecklistItem({ checklist_id: "c1", checklist_item_id: "i2", resolved: true });
  assert.deepEqual(calls, [{ method: "PUT", path: "/api/v2/checklist/c1/checklist_item/i2", body: { resolved: true } }]);
  await agent.close();
});

test("editChecklistItem with a new name sends only the name", async () => {
  const { agent, calls } = mockOne("PUT", "/api/v2/checklist/c1/checklist_item/i2", 200, { checklist });
  const tools = await loadTools();
  await tools.editChecklistItem({ checklist_id: "c1", checklist_item_id: "i2", name: "T2b" });
  assert.deepEqual(calls[0].body, { name: "T2b" });
  await agent.close();
});

test("editChecklistItem with neither name nor resolved makes no request", async () => {
  const { agent, calls } = mockOne("PUT", "/api/v2/checklist/c1/checklist_item/i2", 200, { checklist });
  const tools = await loadTools();
  const result = await tools.editChecklistItem({ checklist_id: "c1", checklist_item_id: "i2" });
  assert.equal(calls.length, 0);
  assert.equal(result.isError, true);
  assert.match(text(result), /name, resolved or both/);
  await agent.close();
});

test("deleteChecklistItem sends one DELETE to the item", async () => {
  const { agent, calls } = mockOne("DELETE", "/api/v2/checklist/c1/checklist_item/i2", 200, {});
  const tools = await loadTools();
  const out = text(await tools.deleteChecklistItem({ checklist_id: "c1", checklist_item_id: "i2" }));
  assert.deepEqual(calls, [{ method: "DELETE", path: "/api/v2/checklist/c1/checklist_item/i2", body: undefined }]);
  assert.match(out, /i2 deleted/);
  await agent.close();
});

test("an unknown checklist id returns ClickUp's error as a tool error", async () => {
  const { agent } = mockOne("DELETE", "/api/v2/checklist/nope", 404, { err: "Checklist not found", ECODE: "CHECK_001" });
  const tools = await loadTools();
  const result = await tools.deleteChecklist({ checklist_id: "nope" });
  assert.equal(result.isError, true);
  assert.match(text(result), /HTTP 404 \(CHECK_001\): Checklist not found/);
  await agent.close();
});

test("createChecklist resolves a Custom Task ID before posting to the task", async () => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  const paths: string[] = [];
  const pool = agent.get("https://api.clickup.com");
  pool
    .intercept({ path: "/api/v2/task/ENG-302?custom_task_ids=true&team_id=team1", method: "GET" })
    .reply(200, (request) => (paths.push(String(request.path)), { id: "task123" }));
  pool
    .intercept({ path: "/api/v2/task/task123/checklist", method: "POST" })
    .reply(200, (request) => (paths.push(String(request.path)), { checklist: { id: "c9", name: "Tasks", items: [] } }));
  const tools = await loadTools();
  const out = text(await tools.createChecklist({ task_id: "ENG-302", name: "Tasks" }));
  assert.deepEqual(paths, ["/api/v2/task/ENG-302?custom_task_ids=true&team_id=team1", "/api/v2/task/task123/checklist"]);
  assert.equal(out, "Checklist: Tasks (checklist_id: c9), 0 of 0 resolved");
  await agent.close();
});
