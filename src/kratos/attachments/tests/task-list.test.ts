import { test } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher } from "undici";

process.env.CLICKUP_API_KEY = "test-key";
process.env.CLICKUP_TEAM_ID = "team1";

const PNG = {
  id: "att-png",
  title: "screen.png",
  extension: "png",
  size: 20480,
  date: "1763460000000",
  url: "https://t1.clickup-attachments.com/att-png/screen.png",
};
const CSV = {
  id: "att-csv",
  title: "story-times.csv",
  extension: "csv",
  size: 1500,
  date: 1763460000000,
  url: "https://t1.clickup-attachments.com/att-csv/story-times.csv",
};

async function block(attachments: unknown) {
  const { taskAttachmentsBlock } = await import("../index");
  const result: any = await taskAttachmentsBlock("task1", attachments as unknown[]);
  assert.equal(result.type, "text");
  return result.text as string;
}

test("taskAttachmentsBlock prints one row per attachment with title, KB, ISO date, url and id", async () => {
  const text = await block([PNG, CSV]);
  const lines = text.split("\n");
  assert.equal(lines[0], "Attachments (2):");
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^- screen\.png \(png, 20 KB, \d{4}-\d{2}-\d{2}T\d{2}:\d{2}[+-]\d{2}:\d{2}\) https:\/\/t1\.clickup-attachments\.com\/att-png\/screen\.png \(attachment_id: att-png\)$/);
  assert.match(lines[2], /^- story-times\.csv \(csv, 1 KB, \d{4}-\d{2}-\d{2}T/);
  assert.match(lines[2], /\(attachment_id: att-csv\)$/);
});

test("taskAttachmentsBlock with no attachments prints none", async () => {
  assert.equal(await block([]), "Attachments: none");
  assert.equal(await block(null), "Attachments: none");
  assert.equal(await block(undefined), "Attachments: none");
});

test("taskAttachmentsBlock falls back to the url file name and ? for a missing size", async () => {
  const text = await block([{ id: "a3", url: "https://t1.clickup-attachments.com/a3/my%20report.pdf?view=open", date: "0" }]);
  assert.match(text, /^- my report\.pdf \(\?, \? KB, /m);
  assert.match(text, /\(attachment_id: a3\)$/);
});

test("getTaskById prints the Attachments block, an image missing from the description included", async (t) => {
  t.mock.timers.enable();
  const { addTaskContentExtension, registerTaskToolsRead } = await import("../../../tools/task-tools");
  const { taskAttachmentsBlock } = await import("../index");
  addTaskContentExtension((task) => taskAttachmentsBlock(task.id, task.attachments));
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  const client = agent.get("https://api.clickup.com");
  client.intercept({ path: "/api/v2/team", method: "GET" }).reply(200, { teams: [{ id: "team1", members: [] }] });
  client.intercept({ path: /\/api\/v2\/task\/task1\?.*/, method: "GET" }).reply(200, {
    id: "task1",
    name: "Task with files",
    markdown_description: "No images here.",
    attachments: [PNG, CSV],
    creator: { username: "creator", id: "1" },
    assignees: [],
    list: { id: "list1", name: "List" },
    space: { id: "space1", name: "Space" },
    status: { status: "open", type: "open" },
    url: "https://app.clickup.com/t/task1",
    date_created: "0",
    date_updated: "0",
  });
  client.intercept({ path: /\/api\/v2\/task\/task1\/comment.*/, method: "GET" }).reply(200, { comments: [] });
  client.intercept({ path: "/api/v2/task/task1/time_in_status", method: "GET" }).reply(200, { status_history: [], current_status: null });
  client.intercept({ path: /\/api\/v2\/team\/team1\/time_entries.*/, method: "GET" }).reply(200, { data: [] });

  const tools: Record<string, any> = {};
  registerTaskToolsRead({ tool: (name: string, ...rest: any[]) => (tools[name] = rest[rest.length - 1]) } as any, {
    user: { username: "me", id: "u1" },
  });
  const result = await tools.getTaskById({ id: "task1" });
  const block = result.content.find((item: any) => typeof item.text === "string" && item.text.startsWith("Attachments ("));
  assert.ok(block, "Attachments block missing");
  assert.match(block.text, /screen\.png \(png, 20 KB, .*\(attachment_id: att-png\)/);
  assert.match(block.text, /story-times\.csv \(csv, 1 KB, .*\(attachment_id: att-csv\)/);
  await agent.close();
});
