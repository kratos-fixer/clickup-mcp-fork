import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG } from "../shared/config";
import { registerChecklistReadTool, registerChecklistWriteTools } from "./checklists";
import { COMMENT_TOOLS, registerCommentToolsWrite } from "./comments";
import { registerDocsToolsRead, DOCS_TOOLS } from "./docs";
import { registerListByStatusTool } from "./list-by-status";
import { CHECKLIST_WRITE_TOOLS, CREATE_TASK_FROM_TEMPLATE_TOOL, GET_TASK_CHECKLISTS_TOOL, GET_TASK_TEMPLATES_TOOL, LIST_TASKS_BY_STATUS_TOOL } from "./settings";
import { ADD_TASK_DEPENDENCY_TOOL, DELETE_TASK_DEPENDENCY_TOOL, registerTaskDependencyTools } from "./task-dependencies";
import { registerTaskTemplatesRead, registerTaskTemplatesWrite } from "./task-templates";

export { DOC_PARENT_TYPES } from "./docs";

export const KRATOS_TOOLS = [
  LIST_TASKS_BY_STATUS_TOOL,
  ...DOCS_TOOLS,
  ...COMMENT_TOOLS,
  GET_TASK_TEMPLATES_TOOL,
  CREATE_TASK_FROM_TEMPLATE_TOOL,
  GET_TASK_CHECKLISTS_TOOL,
  ...Object.values(CHECKLIST_WRITE_TOOLS),
  ADD_TASK_DEPENDENCY_TOOL,
  DELETE_TASK_DEPENDENCY_TOOL,
] as const;

export function registerKratosToolsRead(server: McpServer) {
  registerListByStatusTool(server);
  // read-minimal keeps documents out, as upstream's mode matrix does for its doc tools.
  if (CONFIG.mode !== "read-minimal") registerDocsToolsRead(server);
  registerTaskTemplatesRead(server);
  registerChecklistReadTool(server);
}

// Upstream calls this in write mode only.
export function registerKratosToolsWrite(server: McpServer) {
  registerCommentToolsWrite(server);
  registerTaskTemplatesWrite(server);
  registerChecklistWriteTools(server);
  registerTaskDependencyTools(server);
}
