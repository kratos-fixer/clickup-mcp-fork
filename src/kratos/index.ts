import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListByStatusTool } from "./list-by-status";
import { registerTaskTemplatesRead, registerTaskTemplatesWrite } from "./task-templates";
import { CREATE_TASK_FROM_TEMPLATE_TOOL, GET_TASK_TEMPLATES_TOOL, LIST_TASKS_BY_STATUS_TOOL } from "./settings";

export const KRATOS_TOOLS = [LIST_TASKS_BY_STATUS_TOOL, GET_TASK_TEMPLATES_TOOL, CREATE_TASK_FROM_TEMPLATE_TOOL] as const;

export function registerKratosToolsRead(server: McpServer) {
  registerListByStatusTool(server);
  registerTaskTemplatesRead(server);
}

// Upstream calls this in write mode only.
export function registerKratosToolsWrite(server: McpServer) {
  registerTaskTemplatesWrite(server);
}
