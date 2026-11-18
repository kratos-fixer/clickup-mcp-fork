import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateDocumentUrl } from "../../shared/utils";
import { clickupGet, toolError, toolText, workspaceUrl } from "../clickup-api";
import { DOC_PARENT_TYPES, DOC_SEARCH_LIMIT_MAX, DOC_SEARCH_LIMIT_MIN, SEARCH_DOCUMENTS_TOOL } from "./settings";

export type DocParentKind = keyof typeof DOC_PARENT_TYPES;
const PARENT_KINDS = Object.keys(DOC_PARENT_TYPES) as [DocParentKind, ...DocParentKind[]];

export interface SearchDocumentsInput {
  parent_id?: string;
  parent_kind?: DocParentKind;
  creator?: number;
  include_deleted?: boolean;
  include_archived?: boolean;
  limit?: number;
  cursor?: string;
}

interface DocSearchResponse {
  docs?: any[];
  next_cursor?: string | null;
}

function parentKindName(type: unknown): string {
  const kind = PARENT_KINDS.find((k) => DOC_PARENT_TYPES[k] === Number(type));
  return kind ?? `type ${type ?? "unknown"}`;
}

function isoDate(value: unknown): string {
  const date = new Date(Number(value));
  return value === undefined || value === null || Number.isNaN(date.getTime()) ? "unknown" : date.toISOString();
}

export function formatDoc(doc: any): string {
  return [
    `- ${doc.name ?? "(untitled)"} (doc_id: ${doc.id})`,
    `  parent: ${parentKindName(doc.parent?.type)} (id: ${doc.parent?.id ?? "unknown"})`,
    `  date_created: ${isoDate(doc.date_created)}`,
    `  creator: ${doc.creator === undefined || doc.creator === null ? "unknown" : `user_id: ${doc.creator}`}`,
    `  url: ${generateDocumentUrl(String(doc.id))}`,
  ].join("\n");
}

function placeName(input: SearchDocumentsInput): string {
  return input.parent_id ? `${input.parent_kind} ${input.parent_id}` : "the whole workspace";
}

export async function searchDocuments(input: SearchDocumentsInput) {
  if (Boolean(input.parent_id) !== Boolean(input.parent_kind)) {
    return toolError("searching documents", "parent_id and parent_kind must be given together, or both left out.");
  }
  try {
    const data = await clickupGet<DocSearchResponse>(workspaceUrl("/docs"), {
      parent_id: input.parent_id,
      parent_type: input.parent_kind ? DOC_PARENT_TYPES[input.parent_kind] : undefined,
      creator: input.creator,
      deleted: input.include_deleted === true,
      archived: input.include_archived === true,
      limit: input.limit,
      cursor: input.cursor,
    });
    const docs = Array.isArray(data.docs) ? data.docs : [];
    const lines = docs.length
      ? [`Documents in ${placeName(input)}: ${docs.length}`, ...docs.map(formatDoc)]
      : [`No documents found in ${placeName(input)}.`];
    if (data.next_cursor) lines.push(`next_cursor: ${data.next_cursor}`);
    return toolText(lines);
  } catch (error) {
    return toolError("searching documents", error);
  }
}

export function registerSearchDocumentsTool(server: McpServer) {
  server.tool(
    SEARCH_DOCUMENTS_TOOL,
    [
      "Searches ClickUp documents across the whole workspace, or in one space, folder or list when parent_id and parent_kind are given.",
      "ClickUp has no name filter: to find a document by name, read the output and pick the documents whose name matches.",
      "Deleted and archived documents are left out unless include_deleted / include_archived is true.",
      "When the output ends with a next_cursor line, call again with that cursor to read the next batch.",
    ].join("\n"),
    {
      parent_id: z.string().min(1).optional().describe("Id of the space, folder or list to search in; needs parent_kind"),
      parent_kind: z.enum(PARENT_KINDS).optional().describe("What parent_id is: space, folder or list"),
      creator: z.number().int().optional().describe("Only documents created by this user id"),
      include_deleted: z.boolean().optional().describe("Include deleted documents"),
      include_archived: z.boolean().optional().describe("Include archived documents"),
      limit: z
        .number()
        .int()
        .min(DOC_SEARCH_LIMIT_MIN)
        .max(DOC_SEARCH_LIMIT_MAX)
        .optional()
        .describe(`Documents per batch, ${DOC_SEARCH_LIMIT_MIN}-${DOC_SEARCH_LIMIT_MAX}`),
      cursor: z.string().min(1).optional().describe("next_cursor value from the previous call"),
    },
    { readOnlyHint: true },
    async (input) => searchDocuments(input)
  );
}
