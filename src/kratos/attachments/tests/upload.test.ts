import { afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockAgent, setGlobalDispatcher } from "undici";

let agent: MockAgent;
let kratos: typeof import("../../index");
let dir: string;

function stubServer(tools: Record<string, any>) {
  return { tool: (name: string, ...rest: any[]) => (tools[name] = rest[rest.length - 1]) } as any;
}

function upload(args: Record<string, unknown>) {
  const tools: Record<string, any> = {};
  kratos.registerKratosToolsWrite(stubServer(tools));
  return tools.uploadAttachment({ task_id: "task123", ...args });
}

// Records every request that reaches ClickUp, so a refusal can prove none was sent.
function captureClickUp(reply: unknown = { id: "att1", title: "report.csv", url: "https://t1.clickup-attachments.com/att1/report.csv" }) {
  const requests: { path: string; method: string; body: string }[] = [];
  agent
    .get("https://api.clickup.com")
    .intercept({ path: () => true, method: () => true })
    .reply((opts) => {
      requests.push({ path: opts.path, method: opts.method, body: Buffer.from(opts.body as any).toString("utf8") });
      return { statusCode: 200, data: reply as any };
    })
    .persist();
  return requests;
}

before(async () => {
  process.env.CLICKUP_API_KEY = "test-key";
  process.env.CLICKUP_TEAM_ID = "team1";
  process.env.MAX_UPLOAD_SIZE_MB = "1";
  kratos = await import("../../index");
  dir = mkdtempSync(join(tmpdir(), "upload-test-"));
});

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  await agent.close();
});

test("a local csv is sent as one multipart POST to /task/{id}/attachment and the result names it", async () => {
  const file = join(dir, "report.csv");
  writeFileSync(file, "a,b\n1,2\n");
  const requests = captureClickUp();
  const result = await upload({ source: file });
  assert.equal(result.isError, undefined);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].path, "/api/v2/task/task123/attachment");
  assert.match(requests[0].body, /Content-Disposition: form-data; name="attachment"; filename="report\.csv"/);
  assert.match(requests[0].body, /a,b\n1,2/);
  assert.equal(
    result.content[0].text,
    "attachment_id: att1\ntitle: report.csv\nurl: https://t1.clickup-attachments.com/att1/report.csv"
  );
});

test("a data: URI is decoded and uploaded", async () => {
  const requests = captureClickUp({ id: "att2", url: "https://t1.clickup-attachments.com/att2/file.csv" });
  const data = "data:text/csv;base64," + Buffer.from("x,y\n").toString("base64");
  const result = await upload({ source: data });
  assert.equal(requests.length, 1);
  assert.match(requests[0].body, /filename="file\.csv"/);
  assert.match(requests[0].body, /x,y/);
  assert.match(result.content[0].text, /^attachment_id: att2\ntitle: file\.csv\n/);
});

test("file_name renames the attachment and keeps the source extension", async () => {
  const file = join(dir, "story-times.jsonl");
  writeFileSync(file, "{}\n");
  const requests = captureClickUp({ id: "att3", url: "https://t1.clickup-attachments.com/att3/x.jsonl" });
  await upload({ source: file, file_name: "Time report" });
  assert.match(requests[0].body, /filename="Time report\.jsonl"/);
});

test("refusals send nothing to ClickUp", async () => {
  const dotfile = join(dir, ".env");
  writeFileSync(dotfile, "SECRET=1\n");
  const big = join(dir, "big.csv");
  writeFileSync(big, Buffer.alloc(1.5 * 1024 * 1024, 65));
  agent.get("https://example.com").intercept({ path: "/report.pdf", method: "GET" }).reply(200, "%PDF-1.4 not an image");
  const requests = captureClickUp();

  const cases: [string, RegExp][] = [
    [dotfile, /credential or configuration file/],
    ["https://example.com/report.pdf", /not an image/],
    [big, /exceeds the 1 MB upload limit/],
    ["report.csv", /local path must be absolute: report\.csv/],
    ["https://t1.clickup-attachments.com/att9/old.png", /already a ClickUp attachment, nothing uploaded/],
  ];
  for (const [source, message] of cases) {
    const result = await upload({ source });
    assert.equal(result.isError, true, source);
    assert.match(result.content[0].text, /^Error uploadAttachment failed: /, source);
    assert.match(result.content[0].text, message);
  }
  assert.equal(requests.length, 0);
});

test("a ClickUp error is passed through", async () => {
  const file = join(dir, "ok.csv");
  writeFileSync(file, "1\n");
  agent
    .get("https://api.clickup.com")
    .intercept({ path: "/api/v2/task/task123/attachment", method: "POST" })
    .reply(404, { err: "Task not found" });
  const result = await upload({ source: file });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^Error uploadAttachment failed: Upload of "ok\.csv" failed: 404.*Task not found/);
});
