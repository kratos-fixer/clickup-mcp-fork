import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResolveComment } from "./resolve-comment";
import { RESOLVE_COMMENT_TOOL } from "./settings";

export const COMMENT_TOOLS = [RESOLVE_COMMENT_TOOL] as const;

export function registerCommentToolsWrite(server: McpServer) {
  registerResolveComment(server);
}
