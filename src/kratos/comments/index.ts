import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOLVE_COMMENT_TOOL, registerResolveComment } from "./resolve-comment";

export const COMMENT_TOOLS = [RESOLVE_COMMENT_TOOL] as const;

export function registerCommentToolsWrite(server: McpServer) {
  registerResolveComment(server);
}
