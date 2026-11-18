import { afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher } from "undici";

let agent: MockAgent;
let kratos: typeof import("../../index");

type Handlers = Record<string, any>;

// Collects tool handlers the way upstream tests stub the MCP server.
function stubServer(tools: Handlers) {
  return { tool: (name: string, ...rest: any[]) => (tools[name] = rest[rest.length - 1]) } as any;
}

function writeTools(): Handlers {
  const tools: Handlers = {};
  kratos.registerKratosToolsWrite(stubServer(tools));
  return tools;
}

function capturePut(commentId: string, status = 200, data: unknown = {}) {
  const bodies: string[] = [];
  agent
    .get("https://api.clickup.com")
    .intercept({ path: `/api/v2/comment/${commentId}`, method: "PUT" })
    .reply((opts) => {
      bodies.push(String(opts.body));
      return { statusCode: status, data: data as any };
    });
  return bodies;
}

before(async () => {
  process.env.CLICKUP_API_KEY = "test-key";
  process.env.CLICKUP_TEAM_ID = "team1";
  kratos = await import("../../index");
});

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  await agent.close();
});

test("resolveComment without resolved sends {resolved:true} to PUT /comment/{id}", async () => {
  const bodies = capturePut("c1");
  const result = await writeTools().resolveComment({ comment_id: "c1" });
  assert.deepEqual(bodies, ['{"resolved":true}']);
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0].text, "Comment resolved.\ncomment_id: c1\nresolved: true");
});

test("resolveComment with resolved false reopens the comment", async () => {
  const bodies = capturePut("c1");
  const result = await writeTools().resolveComment({ comment_id: "c1", resolved: false });
  assert.deepEqual(bodies, ['{"resolved":false}']);
  assert.match(result.content[0].text, /^Comment reopened\./);
});

test("resolveComment on an unknown id returns the not_found hint as an error", async () => {
  capturePut("missing", 404, { err: "Comment not found", ECODE: "COMM_001" });
  const result = await writeTools().resolveComment({ comment_id: "missing" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^Error resolving comment: .*404/);
  assert.match(result.content[0].text, /ClickUp has no item with this id/);
});

test("resolveComment failing to reopen names the reopen action in the error", async () => {
  capturePut("missing", 404, { err: "Comment not found", ECODE: "COMM_001" });
  const result = await writeTools().resolveComment({ comment_id: "missing", resolved: false });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^Error reopening comment: .*404/);
});

test("resolveComment is registered in write mode only", () => {
  const read: Handlers = {};
  kratos.registerKratosToolsRead(stubServer(read));
  assert.equal("resolveComment" in read, false);
  assert.equal("resolveComment" in writeTools(), true);
  assert.ok((kratos.KRATOS_TOOLS as readonly string[]).includes("resolveComment"));
});

test("getTaskById prints [resolved] only on the resolved comment header", async (t) => {
  t.mock.timers.enable();
  const client = agent.get("https://api.clickup.com");
  client.intercept({ path: "/api/v2/team", method: "GET" }).reply(200, { teams: [{ id: "team1", members: [] }] });
  client.intercept({ path: /\/api\/v2\/task\/task123\?.*/, method: "GET" }).reply(200, {
    id: "task123",
    name: "Test Task",
    markdown_description: "",
    attachments: [],
    creator: { username: "creator", id: "1" },
    assignees: [],
    list: { id: "list1", name: "List" },
    space: { id: "space1", name: "Space" },
    status: { status: "open", type: "open" },
    url: "https://app.clickup.com/t/task123",
    date_created: "0",
    date_updated: "0",
  });
  client.intercept({ path: "/api/v2/task/task123/comment", method: "GET" }).reply(200, {
    comments: [
      { id: "c1", date: "2000", comment: [{ text: "Done one" }], user: { id: "u1", username: "alice" }, resolved: true },
      { id: "c2", date: "1000", comment: [{ text: "Open one" }], user: { id: "u2", username: "bob" }, resolved: false },
    ],
  });
  client.intercept({ path: "/api/v2/task/task123/time_in_status", method: "GET" }).reply(200, { status_history: [], current_status: null });
  client.intercept({ path: /\/api\/v2\/team\/team1\/time_entries.*/, method: "GET" }).reply(200, { data: [] });

  const { registerTaskToolsRead } = await import("../../../tools/task-tools");
  const tools: Handlers = {};
  registerTaskToolsRead(stubServer(tools), { user: { username: "me", id: "u1" } } as any);
  const result = await tools.getTaskById({ id: "task123" });
  const headers = result.content
    .map((block: any) => block.text)
    .filter((text: unknown) => typeof text === "string" && text.startsWith("Comment by"));
  assert.equal(headers.length, 2);
  assert.match(headers.find((h: string) => h.includes("comment_id: c1")), /\(comment_id: c1\) \[resolved\]:$/);
  assert.match(headers.find((h: string) => h.includes("comment_id: c2")), /\(comment_id: c2\):$/);
  (agent as any).assertNoPendingInterceptors();
  t.mock.timers.reset();
});
