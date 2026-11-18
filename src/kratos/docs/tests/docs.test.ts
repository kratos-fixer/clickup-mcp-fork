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
  test("read-minimal mode does not register searchDocuments", async () => {
    const { CONFIG } = await import("../../../shared/config");
    const { registerKratosToolsRead } = await import("../../index");
    const previous = CONFIG.mode;
    CONFIG.mode = "read-minimal";
    const names: string[] = [];
    try {
      registerKratosToolsRead({ tool: (name: string) => names.push(name) } as any);
    } finally {
      CONFIG.mode = previous;
    }
    assert.ok(!names.includes("searchDocuments"));
    assert.ok(names.includes("listTasksByStatus"));
  });

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

describe("getDocumentPages", () => {
  const PAGES_PATH = `${DOCS_PATH}/doc1/pages`;
  const tree = [
    {
      id: "p1",
      name: "Intro",
      content: "# Intro text",
      pages: [{ id: "p1a", name: "Child", content: "child text", pages: [{ id: "p1a1", name: "Grandchild", content: "deep" }] }],
    },
    { id: "p2", name: "Second", content: "second text" },
  ];

  test("sends max_page_depth -1 and text/md, prints nested pages depth first", async () => {
    const paths = mockDocs(200, tree);
    const result = await tools.getDocumentPages.handler({ doc_id: "doc1" });
    assert.equal(paths.length, 1);
    assert.ok(paths[0].startsWith(`${PAGES_PATH}?`));
    const q = query(paths[0]);
    assert.equal(q.get("max_page_depth"), "-1");
    assert.equal(q.get("content_format"), "text/md");
    const text = result.content[0].text;
    assert.equal(result.isError, undefined);
    const order = ["p1", "p1a", "p1a1", "p2"].map((id) => text.indexOf(`(page_id: ${id})`));
    assert.ok(order.every((pos, i) => pos >= 0 && (i === 0 || pos > order[i - 1])), text);
    assert.match(text, /## Intro \(page_id: p1\)\nurl: https:\/\/app\.clickup\.com\/team1\/v\/dc\/doc1\/p1\n\n# Intro text/);
    assert.doesNotMatch(text, /truncated|not found/);
  });

  test("plain_text sends text/plain", async () => {
    const paths = mockDocs(200, tree);
    await tools.getDocumentPages.handler({ doc_id: "doc1", plain_text: true });
    assert.equal(query(paths[0]).get("content_format"), "text/plain");
  });

  test("page_ids returns only those pages", async () => {
    mockDocs(200, tree);
    const result = await tools.getDocumentPages.handler({ doc_id: "doc1", page_ids: ["p1a1", "p2"] });
    const text = result.content[0].text;
    assert.match(text, /page_id: p1a1\)/);
    assert.match(text, /page_id: p2\)/);
    assert.doesNotMatch(text, /page_id: p1\)|page_id: p1a\)/);
    assert.doesNotMatch(text, /not found/);
  });

  test("an unknown page id is listed under not found with the ids that exist", async () => {
    mockDocs(200, tree);
    const result = await tools.getDocumentPages.handler({ doc_id: "doc1", page_ids: ["p2", "nope"] });
    const text = result.content[0].text;
    assert.match(text, /^not found: nope\npages in this document: p1, p1a, p1a1, p2\n/);
    assert.match(text, /page_id: p2\)/);
  });

  test("an empty doc says No pages", async () => {
    mockDocs(200, []);
    const result = await tools.getDocumentPages.handler({ doc_id: "doc1" });
    assert.equal(result.content[0].text, "No pages in document doc1.");
  });

  test("content past maxResponseSizeMB is cut with a truncated line naming the ids", async () => {
    const { CONFIG } = await import("../../../shared/config");
    const previous = CONFIG.maxResponseSizeMB;
    CONFIG.maxResponseSizeMB = 0.001;
    try {
      const big = "x".repeat(600);
      mockDocs(200, [
        { id: "a", name: "A", content: big },
        { id: "b", name: "B", content: big },
        { id: "c", name: "C", content: big },
      ]);
      const result = await tools.getDocumentPages.handler({ doc_id: "doc1" });
      const text = result.content[0].text;
      assert.match(text, /page_id: a\)/);
      assert.doesNotMatch(text, /## B/);
      const lines = text.split("\n");
      assert.equal(lines[lines.length - 1], "truncated: 2 pages not shown (page_ids: b, c)");
    } finally {
      CONFIG.maxResponseSizeMB = previous;
    }
  });

  test("a page larger than maxResponseSizeMB is cut and read on with content_offset", async () => {
    const { CONFIG } = await import("../../../shared/config");
    const previous = CONFIG.maxResponseSizeMB;
    CONFIG.maxResponseSizeMB = 0.001;
    try {
      const huge = "é".repeat(400) + "y".repeat(400);
      const doc = [
        { id: "a", name: "A", content: huge },
        { id: "b", name: "B", content: "small" },
      ];
      mockDocs(200, doc);
      const first = (await tools.getDocumentPages.handler({ doc_id: "doc1" })).content[0].text;
      assert.ok(Buffer.byteLength(first, "utf8") < 1200, first);
      const next = first.match(/truncated: page a cut; continue with page_ids=\["a"\] content_offset=(\d+)/);
      assert.ok(next, first);
      assert.match(first, /truncated: 1 pages not shown \(page_ids: b\)/);
      const offset = Number(next[1]);
      const shown = first.split("\n\n")[1].split("\n")[0];
      assert.equal(shown, huge.slice(0, offset));

      mockDocs(200, doc);
      const second = (
        await tools.getDocumentPages.handler({ doc_id: "doc1", page_ids: ["a"], content_offset: offset })
      ).content[0].text;
      assert.ok(second.includes(huge.slice(offset)), second);
      assert.doesNotMatch(second, /truncated/);
    } finally {
      CONFIG.maxResponseSizeMB = previous;
    }
  });

  test("a 404 returns the clickup-api error text", async () => {
    mockDocs(404, { err: "Doc not found", ECODE: "DOC_001" });
    const result = await tools.getDocumentPages.handler({ doc_id: "doc1" });
    assert.equal(result.isError, true);
    assert.match(
      result.content[0].text,
      /^Error reading document pages: ClickUp GET \/api\/v3\/workspaces\/team1\/docs\/doc1\/pages failed with HTTP 404/
    );
  });
});
