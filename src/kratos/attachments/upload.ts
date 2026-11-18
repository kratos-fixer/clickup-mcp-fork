import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { captionToFilename, resolveAttachmentSource, uploadTaskAttachment } from "../../shared/attachments";
import { CONFIG } from "../../shared/config";
import { TASK_ID_FORMAT_HINT, resolveTaskId, taskIdSchema } from "../../shared/task-ids";
import { toolError, toolText } from "../clickup-api";

export const UPLOAD_ATTACHMENT_TOOL = "uploadAttachment";

export function registerAttachmentToolsWrite(server: McpServer) {
  server.tool(
    UPLOAD_ATTACHMENT_TOOL,
    [
      "Attach one file to a task without posting a comment. Prints the new attachment_id, title and url.",
      "source is a local absolute path (any file type), an http(s) URL of an image, or a `data:` URI. Files other than images cannot come from a URL.",
      `Credential files (dotfiles such as .env, private keys, ~/.ssh, ~/.aws) are refused. The size limit is MAX_UPLOAD_SIZE_MB (now ${CONFIG.maxUploadSizeMB} MB).`,
      "An existing ClickUp attachment URL is refused: the file is already in ClickUp.",
    ].join("\n"),
    {
      task_id: taskIdSchema(`The task to attach the file to: ${TASK_ID_FORMAT_HINT}`),
      source: z.string().min(1).describe("Local absolute path, image http(s) URL or data: URI"),
      file_name: z
        .string()
        .optional()
        .describe("Attachment name shown in ClickUp; the source's extension is kept"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async ({ task_id, source, file_name }) => {
      try {
        // Resolve first: every refusal (secret file, size, non-image URL) happens before any ClickUp request.
        const resolved = await resolveAttachmentSource(source);
        if (resolved.kind === "existing") {
          return toolError(UPLOAD_ATTACHMENT_TOOL, new Error(`already a ClickUp attachment, nothing uploaded: ${resolved.url}`));
        }
        const name = file_name ? captionToFilename(file_name, resolved.suggestedName) : resolved.suggestedName;
        const taskId = await resolveTaskId(task_id);
        const attachment = await uploadTaskAttachment(taskId, name, resolved.bytes, resolved.mimeType);
        return toolText([
          `attachment_id: ${attachment.id}`,
          `title: ${attachment.title || name}`,
          `url: ${attachment.url}`,
        ]);
      } catch (error) {
        return toolError("uploadAttachment failed", error);
      }
    }
  );
}
