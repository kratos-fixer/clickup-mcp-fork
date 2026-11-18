import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CLICKUP_V2_BASE, clickupPut, toolError, toolText } from "../clickup-api";
import { RESOLVE_COMMENT_TOOL } from "./settings";

export function registerResolveComment(server: McpServer) {
  server.tool(
    RESOLVE_COMMENT_TOOL,
    "Marks a task comment as resolved, or reopens it with `resolved: false`. The comment text is not changed. Use the comment_id printed by getTaskById.",
    {
      comment_id: z.string().min(1).describe("The comment_id printed by getTaskById"),
      resolved: z.boolean().optional().describe("true to resolve (default), false to reopen"),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async ({ comment_id, resolved }) => {
      const state = resolved ?? true;
      try {
        // Only `resolved` is sent: resending the text would flatten rich comments into plain text.
        await clickupPut(`${CLICKUP_V2_BASE}/comment/${encodeURIComponent(comment_id)}`, { resolved: state });
        return toolText([state ? "Comment resolved." : "Comment reopened.", `comment_id: ${comment_id}`, `resolved: ${state}`]);
      } catch (error) {
        return toolError("resolving comment", error);
      }
    }
  );
}
