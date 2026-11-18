import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG } from "../shared/config";
import { registerChecklistReadTool, registerChecklistWriteTools } from "./checklists";
import { registerDocsToolsRead, DOCS_TOOLS } from "./docs";
import { registerListByStatusTool } from "./list-by-status";
import { CHECKLIST_WRITE_TOOLS, GET_TASK_CHECKLISTS_TOOL, LIST_TASKS_BY_STATUS_TOOL } from "./settings";

export { DOC_PARENT_TYPES } from "./docs";

export const KRATOS_TOOLS = [
  LIST_TASKS_BY_STATUS_TOOL,
  ...DOCS_TOOLS,
  GET_TASK_CHECKLISTS_TOOL,
  ...Object.values(CHECKLIST_WRITE_TOOLS),
] as const;

export function registerKratosToolsRead(server: McpServer) {
  registerListByStatusTool(server);
  // read-minimal keeps documents out, as upstream's mode matrix does for its doc tools.
  if (CONFIG.mode !== "read-minimal") registerDocsToolsRead(server);
  registerChecklistReadTool(server);
}

// Upstream calls this in write mode only.
export function registerKratosToolsWrite(server: McpServer) {
  registerChecklistWriteTools(server);
}
