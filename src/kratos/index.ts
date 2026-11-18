import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG } from "../shared/config";
import { registerDocsToolsRead, DOCS_TOOLS } from "./docs";
import { registerListByStatusTool } from "./list-by-status";
import { ADD_TASK_DEPENDENCY_TOOL, DELETE_TASK_DEPENDENCY_TOOL, registerTaskDependencyTools } from "./task-dependencies";
import { registerTaskTemplatesRead, registerTaskTemplatesWrite } from "./task-templates";
import { COMMENT_TOOLS, registerCommentToolsWrite } from "./comments";
import { CREATE_TASK_FROM_TEMPLATE_TOOL, GET_TASK_TEMPLATES_TOOL, LIST_TASKS_BY_STATUS_TOOL } from "./settings";

export { DOC_PARENT_TYPES } from "./docs";
export { taskAttachmentsBlock } from "./attachments";

export const KRATOS_TOOLS = [
  LIST_TASKS_BY_STATUS_TOOL,
  ...DOCS_TOOLS,
  ...COMMENT_TOOLS,
  GET_TASK_TEMPLATES_TOOL,
  CREATE_TASK_FROM_TEMPLATE_TOOL,
  ADD_TASK_DEPENDENCY_TOOL,
  DELETE_TASK_DEPENDENCY_TOOL,
] as const;

export function registerKratosToolsRead(server: McpServer) {
  registerListByStatusTool(server);
  // read-minimal keeps documents out, as upstream's mode matrix does for its doc tools.
  if (CONFIG.mode !== "read-minimal") registerDocsToolsRead(server);
  registerTaskTemplatesRead(server);
}

// Upstream calls this in write mode only.
export function registerKratosToolsWrite(server: McpServer) {
  registerCommentToolsWrite(server);
  registerTaskTemplatesWrite(server);
  registerTaskDependencyTools(server);
}
