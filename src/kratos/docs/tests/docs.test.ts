import { afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { MockAgent, setGlobalDispatcher } from "undici";

let tools: Record<string, { schema: Record<string, z.ZodTypeAny>; handler: (input: any) => Promise<any> }>;
let agent: MockAgent;

const DOCS_PATH = "/api/v3/workspaces/team1/docs";

function mockDocs(status: number, data: unknown) {
  const paths: string[] = [];
  agent
    .get("https://api.clickup.com")
    .intercept({ path: (path) => path.startsWith(DOCS_PATH), method: "GET" })
    .reply((opts) => {
      paths.push(opts.path);
      return { statusCode: status, data: data as any };
    });
  return paths;
}

const query = (path: string) => new URLSearchParams(path.split("?")[1] ?? "");

const doc = {
  id: "8cdu8-123",
  name: "Release log",
  parent: { id: "90150001", type: 5 },
  creator: 42,
  date_created: Date.UTC(2026, 10, 18, 10, 0, 0),
};

before(async () => {
  process.env.CLICKUP_API_KEY = "test-key";
  process.env.CLICKUP_TEAM_ID = "team1";
  const { registerKratosToolsRead } = await import("../../index");
  tools = {};
  registerKratosToolsRead({
    tool: (name: string, ...rest: any[]) => (tools[name] = { schema: rest[1], handler: rest[rest.length - 1] }),
  } as any);
});

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  await agent.close();
});

describe("searchDocuments", () => {
  test("a named place sends parent_id and parent_type, deleted and archived false", async () => {
    const paths = mockDocs(200, { docs: [doc] });
    const result = await tools.searchDocuments.handler({ parent_id: "90150001", parent_kind: "folder" });
    assert.equal(paths.length, 1);
    assert.ok(paths[0].startsWith(`${DOCS_PATH}?`));
    const q = query(paths[0]);
    assert.equal(q.get("parent_id"), "90150001");
    assert.equal(q.get("parent_type"), "5");
    assert.equal(q.get("deleted"), "false");
    assert.equal(q.get("archived"), "false");
    const text = result.content[0].text;
    assert.equal(result.isError, undefined);
    assert.match(text, /Documents in folder 90150001: 1/);
    assert.match(text, /- Release log \(doc_id: 8cdu8-123\)/);
    assert.match(text, /parent: folder \(id: 90150001\)/);
    assert.match(text, /date_created: 2026-11-18T10:00:00\.000Z/);
    assert.match(text, /creator: user_id: 42/);
    assert.match(text, /url: https:\/\/app\.clickup\.com\/team1\/v\/dc\/8cdu8-123/);
    assert.doesNotMatch(text, /next_cursor/);
  });

  test("no place searches the whole workspace without parent filters", async () => {
    const paths = mockDocs(200, { docs: [doc] });
    await tools.searchDocuments.handler({});
    const q = query(paths[0]);
    assert.equal(q.get("parent_id"), null);
    assert.equal(q.get("parent_type"), null);
    assert.equal(q.get("deleted"), "false");
    assert.equal(q.get("archived"), "false");
  });

  test("include_deleted and include_archived send true", async () => {
    const paths = mockDocs(200, { docs: [] });
    await tools.searchDocuments.handler({ include_deleted: true, include_archived: true, limit: 50, cursor: "c1" });
    const q = query(paths[0]);
    assert.equal(q.get("deleted"), "true");
    assert.equal(q.get("archived"), "true");
    assert.equal(q.get("limit"), "50");
    assert.equal(q.get("cursor"), "c1");
  });

  test("next_cursor in the response is the last output line", async () => {
    mockDocs(200, { docs: [doc], next_cursor: "abc123" });
    const result = await tools.searchDocuments.handler({});
    const lines = result.content[0].text.split("\n");
    assert.equal(lines[lines.length - 1], "next_cursor: abc123");
  });

  test("an empty result names the place searched", async () => {
    mockDocs(200, { docs: [] });
    const result = await tools.searchDocuments.handler({ parent_id: "s1", parent_kind: "space" });
    assert.equal(result.content[0].text, "No documents found in space s1.");
  });

  test("parent_id without parent_kind, or the reverse, sends nothing", async () => {
    const paths = mockDocs(200, { docs: [] });
    for (const input of [{ parent_id: "s1" }, { parent_kind: "list" }]) {
      const result = await tools.searchDocuments.handler(input);
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /parent_id and parent_kind must be given together/);
    }
    assert.equal(paths.length, 0);
  });

  test("a 401 returns the clickup-api error text", async () => {
    mockDocs(401, { err: "Token invalid", ECODE: "OAUTH_025" });
    const result = await tools.searchDocuments.handler({});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /^Error searching documents: ClickUp GET \/api\/v3\/workspaces\/team1\/docs failed with HTTP 401 \(OAUTH_025\): Token invalid/);
  });

  test("limit outside the bounds is refused by the schema", () => {
    const limit = tools.searchDocuments.schema.limit;
    assert.equal(limit.safeParse(9).success, false);
    assert.equal(limit.safeParse(101).success, false);
    assert.equal(limit.safeParse(10).success, true);
    assert.equal(limit.safeParse(100).success, true);
  });
});
