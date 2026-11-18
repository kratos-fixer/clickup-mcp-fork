import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GET_DOCUMENT_PAGES_TOOL, SEARCH_DOCUMENTS_TOOL } from "./settings";
import { registerSearchDocumentsTool } from "./search";
import { registerGetDocumentPagesTool } from "./pages";

export const DOCS_TOOLS = [SEARCH_DOCUMENTS_TOOL, GET_DOCUMENT_PAGES_TOOL] as const;

export function registerDocsToolsRead(server: McpServer) {
  registerSearchDocumentsTool(server);
  registerGetDocumentPagesTool(server);
}
export { DOC_PARENT_TYPES } from "./settings";
