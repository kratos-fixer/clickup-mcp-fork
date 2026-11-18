import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerChecklistReadTool, registerChecklistWriteTools } from "./checklists";
import { registerListByStatusTool } from "./list-by-status";
import { CHECKLIST_WRITE_TOOLS, GET_TASK_CHECKLISTS_TOOL, LIST_TASKS_BY_STATUS_TOOL } from "./settings";

export const KRATOS_TOOLS = [
  LIST_TASKS_BY_STATUS_TOOL,
  GET_TASK_CHECKLISTS_TOOL,
  ...Object.values(CHECKLIST_WRITE_TOOLS),
] as const;

export function registerKratosToolsRead(server: McpServer) {
  registerListByStatusTool(server);
  registerChecklistReadTool(server);
}

// Upstream calls this in write mode only.
export function registerKratosToolsWrite(server: McpServer) {
  registerChecklistWriteTools(server);
}
