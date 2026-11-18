import { ContentBlock } from "../../shared/types";
import { BYTES_PER_KB } from "../settings";

type RawAttachment = {
  id?: string;
  title?: string;
  extension?: string;
  size?: number | string | null;
  date?: number | string | null;
  url?: string;
};

// Copied from src/tools/task-tools.ts, which does not export it.
function timestampToIso(timestamp: number | string): string {
  const date = new Date(+timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  const offset = date.getTimezoneOffset();
  const sign = offset <= 0 ? "+" : "-";
  const zone = sign + pad(Math.floor(Math.abs(offset) / 60)) + ":" + pad(Math.abs(offset) % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}${zone}`;
}

function fileNameFromUrl(url: string | undefined): string {
  const last = url?.split("?")[0].split("/").pop();
  if (!last) return "?";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function isNumeric(value: number | string | null | undefined): value is number | string {
  return value !== undefined && value !== null && value !== "" && !isNaN(+value);
}

function attachmentLine(entry: RawAttachment): string {
  const title = entry.title || fileNameFromUrl(entry.url);
  const extension = entry.extension || "?";
  const size = isNumeric(entry.size) ? String(Math.round(+entry.size / BYTES_PER_KB)) : "?";
  const date = isNumeric(entry.date) ? timestampToIso(entry.date) : "?";
  return `- ${title} (${extension}, ${size} KB, ${date}) ${entry.url ?? "?"} (attachment_id: ${entry.id ?? "?"})`;
}

// Async so a second attachment source can join later without touching the upstream call site.
export async function taskAttachmentsBlock(
  _taskId: string,
  attachments: unknown[] | null | undefined,
): Promise<ContentBlock> {
  const entries = (Array.isArray(attachments) ? attachments : []) as RawAttachment[];
  if (entries.length === 0) return { type: "text", text: "Attachments: none" };
  return { type: "text", text: [`Attachments (${entries.length}):`, ...entries.map(attachmentLine)].join("\n") };
}
