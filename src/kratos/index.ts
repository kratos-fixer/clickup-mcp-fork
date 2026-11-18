import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG } from "../shared/config";
import { registerDocsToolsRead, DOCS_TOOLS } from "./docs";
import { registerListByStatusTool } from "./list-by-status";
import { LIST_TASKS_BY_STATUS_TOOL } from "./settings";
import { COMMENT_TOOLS, registerCommentToolsWrite } from "./comments";

export { DOC_PARENT_TYPES } from "./docs";

export const KRATOS_TOOLS = [LIST_TASKS_BY_STATUS_TOOL, ...DOCS_TOOLS, ...COMMENT_TOOLS] as const;

export function registerKratosToolsRead(server: McpServer) {
  registerListByStatusTool(server);
  // read-minimal keeps documents out, as upstream's mode matrix does for its doc tools.
  if (CONFIG.mode !== "read-minimal") registerDocsToolsRead(server);
}

// Upstream calls this in write mode only.
export function registerKratosToolsWrite(server: McpServer) {
  registerCommentToolsWrite(server);
}
