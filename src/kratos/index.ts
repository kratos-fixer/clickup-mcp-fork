import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG } from "../shared/config";
import { registerDocsToolsRead, DOCS_TOOLS } from "./docs";
import { registerListByStatusTool } from "./list-by-status";
import { LIST_TASKS_BY_STATUS_TOOL } from "./settings";

export { DOC_PARENT_TYPES } from "./docs";
export { taskAttachmentsBlock } from "./attachments";

export const KRATOS_TOOLS = [LIST_TASKS_BY_STATUS_TOOL, ...DOCS_TOOLS] as const;

export function registerKratosToolsRead(server: McpServer) {
  registerListByStatusTool(server);
  // read-minimal keeps documents out, as upstream's mode matrix does for its doc tools.
  if (CONFIG.mode !== "read-minimal") registerDocsToolsRead(server);
}

// Upstream calls this in write mode only; our write tools join here when they exist.
export function registerKratosToolsWrite(_server: McpServer) {}
