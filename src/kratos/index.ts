import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListByStatusTool } from "./list-by-status";
import { LIST_TASKS_BY_STATUS_TOOL } from "./settings";
import { COMMENT_TOOLS, registerCommentToolsWrite } from "./comments";

export const KRATOS_TOOLS = [LIST_TASKS_BY_STATUS_TOOL, ...COMMENT_TOOLS] as const;

export function registerKratosToolsRead(server: McpServer) {
  registerListByStatusTool(server);
}

// Upstream calls this in write mode only.
export function registerKratosToolsWrite(server: McpServer) {
  registerCommentToolsWrite(server);
}
