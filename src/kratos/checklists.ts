import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CLICKUP_V2_BASE, clickupDelete, clickupGet, clickupPost, clickupPut, toolError, toolText } from "./clickup-api";
import { TASK_ID_FORMAT_HINT, resolveTaskId, taskIdSchema } from "../shared/task-ids";
import { CHECKLIST_WRITE_TOOLS, GET_TASK_CHECKLISTS_TOOL } from "./settings";

export interface ChecklistItem {
  id: string;
  name: string;
  orderindex?: number;
  resolved?: boolean;
}

export interface Checklist {
  id: string;
  name: string;
  orderindex?: number;
  resolved?: number;
  unresolved?: number;
  items?: ChecklistItem[];
}

const byOrder = <T extends { orderindex?: number }>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => (a.orderindex ?? 0) - (b.orderindex ?? 0));

const checklistUrl = (checklistId: string) => `${CLICKUP_V2_BASE}/checklist/${encodeURIComponent(checklistId)}`;
const itemUrl = (checklistId: string, itemId: string) =>
  `${checklistUrl(checklistId)}/checklist_item/${encodeURIComponent(itemId)}`;

// Nested items are listed in the same flat row as their parent; only order and state matter here.
export function formatChecklist(checklist: Checklist): string[] {
  const items = byOrder(checklist.items ?? []);
  const resolved = items.filter((item) => item.resolved).length;
  return [
    `Checklist: ${checklist.name} (checklist_id: ${checklist.id}), ${resolved} of ${items.length} resolved`,
    ...items.map((item) => `- [${item.resolved ? "x" : " "}] ${item.name} (item_id: ${item.id}, resolved: ${item.resolved === true})`),
  ];
}

export function formatChecklists(checklists: readonly Checklist[]): string[] {
  if (checklists.length === 0) return ["No checklists."];
  return byOrder(checklists).flatMap(formatChecklist);
}

const checklistResult = (data: { checklist?: Checklist }) =>
  toolText(data.checklist ? formatChecklist(data.checklist) : ["Done."]);

export function registerChecklistReadTool(server: McpServer) {
  server.tool(
    GET_TASK_CHECKLISTS_TOOL,
    "Lists the checklists of a task with their items, ids and resolved state. Use it to find the checklist_id and item_id the checklist write tools need.",
    { task_id: taskIdSchema(`The task whose checklists to read: ${TASK_ID_FORMAT_HINT}`) },
    { readOnlyHint: true },
    async ({ task_id }) => {
      try {
        const taskId = await resolveTaskId(task_id);
        const task = await clickupGet<{ checklists?: Checklist[] }>(`${CLICKUP_V2_BASE}/task/${encodeURIComponent(taskId)}`);
        return toolText(formatChecklists(task.checklists ?? []));
      } catch (error) {
        return toolError("reading checklists", error);
      }
    }
  );
}

export function registerChecklistWriteTools(server: McpServer) {
  const name = z.string().min(1);
  const checklistId = z.string().min(1).describe("The checklist ID, as shown by getTaskChecklists");
  const itemId = z.string().min(1).describe("The checklist item ID, as shown by getTaskChecklists");

  server.tool(
    CHECKLIST_WRITE_TOOLS.createChecklist,
    "Creates an empty checklist on a task. Add its items with createChecklistItem.",
    { task_id: taskIdSchema(`The task to add the checklist to: ${TASK_ID_FORMAT_HINT}`), name: name.describe("Checklist name") },
    async ({ task_id, name }) => {
      try {
        const taskId = await resolveTaskId(task_id);
        return checklistResult(await clickupPost(`${CLICKUP_V2_BASE}/task/${encodeURIComponent(taskId)}/checklist`, { name }));
      } catch (error) {
        return toolError("creating checklist", error);
      }
    }
  );

  server.tool(
    CHECKLIST_WRITE_TOOLS.renameChecklist,
    "Renames a checklist.",
    { checklist_id: checklistId, name: name.describe("New checklist name") },
    async ({ checklist_id, name }) => {
      try {
        await clickupPut(checklistUrl(checklist_id), { name });
        return toolText([`Checklist ${checklist_id} renamed to ${name}.`]);
      } catch (error) {
        return toolError("renaming checklist", error);
      }
    }
  );

  server.tool(
    CHECKLIST_WRITE_TOOLS.deleteChecklist,
    "Deletes a checklist together with all its items.",
    { checklist_id: checklistId },
    { destructiveHint: true },
    async ({ checklist_id }) => {
      try {
        await clickupDelete(checklistUrl(checklist_id));
        return toolText([`Checklist ${checklist_id} deleted with all its items.`]);
      } catch (error) {
        return toolError("deleting checklist", error);
      }
    }
  );

  server.tool(
    CHECKLIST_WRITE_TOOLS.createChecklistItem,
    "Adds an unresolved item at the end of a checklist.",
    { checklist_id: checklistId, name: name.describe("Item text") },
    async ({ checklist_id, name }) => {
      try {
        return checklistResult(await clickupPost(`${checklistUrl(checklist_id)}/checklist_item`, { name }));
      } catch (error) {
        return toolError("creating checklist item", error);
      }
    }
  );

  server.tool(
    CHECKLIST_WRITE_TOOLS.editChecklistItem,
    "Changes the text of a checklist item, resolves or unresolves it. Only the fields passed are changed.",
    {
      checklist_id: checklistId,
      checklist_item_id: itemId,
      name: name.optional().describe("New item text"),
      resolved: z.boolean().optional().describe("true to tick the item, false to untick it"),
    },
    async ({ checklist_id, checklist_item_id, name, resolved }) => {
      const body: { name?: string; resolved?: boolean } = {};
      if (name !== undefined) body.name = name;
      if (resolved !== undefined) body.resolved = resolved;
      try {
        return checklistResult(await clickupPut(itemUrl(checklist_id, checklist_item_id), body));
      } catch (error) {
        return toolError("editing checklist item", error);
      }
    }
  );

  server.tool(
    CHECKLIST_WRITE_TOOLS.deleteChecklistItem,
    "Deletes one checklist item.",
    { checklist_id: checklistId, checklist_item_id: itemId },
    { destructiveHint: true },
    async ({ checklist_id, checklist_item_id }) => {
      try {
        await clickupDelete(itemUrl(checklist_id, checklist_item_id));
        return toolText([`Checklist item ${checklist_item_id} deleted from checklist ${checklist_id}.`]);
      } catch (error) {
        return toolError("deleting checklist item", error);
      }
    }
  );
}
