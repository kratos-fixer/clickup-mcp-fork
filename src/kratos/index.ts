import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListByStatusTool } from "./list-by-status";
import { ADD_TASK_DEPENDENCY_TOOL, DELETE_TASK_DEPENDENCY_TOOL, registerTaskDependencyTools } from "./task-dependencies";
import { LIST_TASKS_BY_STATUS_TOOL } from "./settings";

export const KRATOS_TOOLS = [LIST_TASKS_BY_STATUS_TOOL, ADD_TASK_DEPENDENCY_TOOL, DELETE_TASK_DEPENDENCY_TOOL] as const;

export function registerKratosToolsRead(server: McpServer) {
  registerListByStatusTool(server);
}

// Upstream calls this in write mode only.
export function registerKratosToolsWrite(server: McpServer) {
  registerTaskDependencyTools(server);
}
