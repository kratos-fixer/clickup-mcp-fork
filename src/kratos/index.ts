import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG } from "../shared/config";
import { registerDocsToolsRead, DOCS_TOOLS } from "./docs";
import { registerListByStatusTool } from "./list-by-status";
import { ADD_TASK_DEPENDENCY_TOOL, DELETE_TASK_DEPENDENCY_TOOL, registerTaskDependencyTools } from "./task-dependencies";
import { LIST_TASKS_BY_STATUS_TOOL } from "./settings";

export { DOC_PARENT_TYPES } from "./docs";

export const KRATOS_TOOLS = [
  LIST_TASKS_BY_STATUS_TOOL,
  ...DOCS_TOOLS,
  ADD_TASK_DEPENDENCY_TOOL,
  DELETE_TASK_DEPENDENCY_TOOL,
] as const;

export function registerKratosToolsRead(server: McpServer) {
  registerListByStatusTool(server);
  // read-minimal keeps documents out, as upstream's mode matrix does for its doc tools.
  if (CONFIG.mode !== "read-minimal") registerDocsToolsRead(server);
}

// Upstream calls this in write mode only.
export function registerKratosToolsWrite(server: McpServer) {
  registerTaskDependencyTools(server);
}
