import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SEARCH_DOCUMENTS_TOOL } from "./settings";
import { registerSearchDocumentsTool } from "./search";

export const DOCS_TOOLS = [SEARCH_DOCUMENTS_TOOL] as const;

export function registerDocsToolsRead(server: McpServer) {
  registerSearchDocumentsTool(server);
}
export { DOC_PARENT_TYPES } from "./settings";
