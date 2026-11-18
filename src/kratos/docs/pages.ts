import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CONFIG } from "../../shared/config";
import { generateDocumentUrl } from "../../shared/utils";
import { clickupGet, toolError, toolText, workspaceUrl } from "../clickup-api";
import { DOC_PAGES_ALL_DEPTH, GET_DOCUMENT_PAGES_TOOL } from "./settings";

export interface GetDocumentPagesInput {
  doc_id: string;
  page_ids?: string[];
  plain_text?: boolean;
  content_offset?: number;
}

interface DocPage {
  id: string;
  name?: string;
  content?: string;
  pages?: DocPage[];
}

// Depth first, so a child page follows its parent in the order the doc shows them.
export function flattenPages(pages: readonly DocPage[] | undefined): DocPage[] {
  return (pages ?? []).flatMap((page) => [page, ...flattenPages(page.pages)]);
}

function pageBlock(docId: string, page: DocPage): string {
  return [
    `## ${page.name || "(untitled)"} (page_id: ${page.id})`,
    `url: ${generateDocumentUrl(docId, page.id)}`,
    "",
    page.content ?? "",
  ].join("\n");
}

export async function getDocumentPages(input: GetDocumentPagesInput) {
  try {
    const data = await clickupGet<DocPage[] | { pages?: DocPage[] }>(
      workspaceUrl(`/docs/${encodeURIComponent(input.doc_id)}/pages`),
      {
        max_page_depth: DOC_PAGES_ALL_DEPTH,
        content_format: input.plain_text ? "text/plain" : "text/md",
      }
    );
    const all = flattenPages(Array.isArray(data) ? data : data.pages);
    if (!all.length) return toolText([`No pages in document ${input.doc_id}.`]);

    const wanted = input.page_ids?.length ? new Set(input.page_ids) : undefined;
    const pages = wanted ? all.filter((page) => wanted.has(page.id)) : all;
    const known = new Set(all.map((page) => page.id));
    const missing = [...(wanted ?? [])].filter((id) => !known.has(id));
    const lines: string[] = [];
    if (missing.length) {
      lines.push(`not found: ${missing.join(", ")}`, `pages in this document: ${[...known].join(", ")}`, "");
    }

    const offset = input.content_offset ?? 0;
    let left = CONFIG.maxResponseSizeMB * 1024 * 1024;
    let shown = 0;
    let cut: string | undefined;
    for (const page of pages) {
      const content = (page.content ?? "").slice(offset);
      const block = pageBlock(input.doc_id, { ...page, content });
      const size = Buffer.byteLength(block, "utf8");
      if (size <= left) {
        lines.push(block, "");
        left -= size;
        shown++;
        continue;
      }
      // A page bigger than the whole budget is shown in part, so it can still be read in steps.
      if (shown === 0) {
        const head = pageBlock(input.doc_id, { ...page, content: "" });
        const room = new Uint8Array(Math.max(0, left - Buffer.byteLength(head, "utf8")));
        const { read } = new TextEncoder().encodeInto(content, room);
        lines.push(head + content.slice(0, read), "");
        cut = `truncated: page ${page.id} cut; continue with page_ids=["${page.id}"] content_offset=${offset + read}`;
        shown++;
      }
      break;
    }
    if (cut) lines.push(cut);
    const hidden = pages.slice(shown);
    if (hidden.length) {
      lines.push(`truncated: ${hidden.length} pages not shown (page_ids: ${hidden.map((page) => page.id).join(", ")})`);
    }
    return toolText(lines);
  } catch (error) {
    return toolError("reading document pages", error);
  }
}

export function registerGetDocumentPagesTool(server: McpServer) {
  server.tool(
    GET_DOCUMENT_PAGES_TOOL,
    [
      "Reads every page of a ClickUp document in one call, nested pages included, in the order the document shows them.",
      "Give page_ids to read only those pages. Content comes as Markdown, or plain text when plain_text is true.",
      "When the output ends with a truncated line, make the further call it names (page_ids, and content_offset for a page cut part way).",
    ].join("\n"),
    {
      doc_id: z.string().min(1).describe("Document id"),
      page_ids: z.array(z.string().min(1)).optional().describe("Only these page ids"),
      plain_text: z.boolean().optional().describe("Plain text instead of Markdown"),
      content_offset: z.number().int().min(0).optional().describe("Skip this many characters of each page's content"),
    },
    { readOnlyHint: true },
    async (input) => getDocumentPages(input)
  );
}
