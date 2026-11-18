import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CLICKUP_V2_BASE, clickupGet, clickupPost, teamUrl, toolError, toolText } from "../clickup-api";
import { CREATE_TASK_FROM_TEMPLATE_TOOL, GET_TASK_TEMPLATES_TOOL, TEMPLATE_SEARCH_MAX_PAGES } from "../settings";

export type TaskTemplate = { id: string; name: string };
type TemplateLookup = { match?: TaskTemplate; seen: TaskTemplate[] };

export async function fetchTemplatePage(page: number): Promise<TaskTemplate[]> {
  const data = await clickupGet<{ templates?: any[] }>(teamUrl("/taskTemplate"), { page });
  const templates = Array.isArray(data.templates) ? data.templates : [];
  return templates.map((t) => ({ id: String(t.id), name: String(t.name ?? "") }));
}

export async function findTemplateByName(name: string, startPage = 0): Promise<TemplateLookup> {
  const wanted = name.trim().toLowerCase();
  const seen: TaskTemplate[] = [];
  for (let page = startPage; page < startPage + TEMPLATE_SEARCH_MAX_PAGES; page++) {
    const templates = await fetchTemplatePage(page);
    if (templates.length === 0) break;
    seen.push(...templates);
    const match = templates.find((t) => t.name.trim().toLowerCase() === wanted);
    if (match) return { match, seen };
  }
  return { seen };
}

const formatTemplate = (t: TaskTemplate) => `- ${t.name} (template_id: ${t.id})`;

function notFoundText(name: string, seen: TaskTemplate[]): string[] {
  const head = `No task template named "${name}" in ${TEMPLATE_SEARCH_MAX_PAGES} pages at most.`;
  return seen.length ? [head, "Templates seen:", ...seen.map(formatTemplate)] : [head, "No task templates."];
}

export function registerTaskTemplatesRead(server: McpServer) {
  server.tool(
    GET_TASK_TEMPLATES_TOOL,
    [
      "Lists the workspace's task templates with their template_id, one page at a time.",
      `With name, reads pages from the given one until a template matches the name (case-insensitive), an empty page, or ${TEMPLATE_SEARCH_MAX_PAGES} pages.`,
    ].join("\n"),
    {
      page: z.number().int().min(0).default(0).describe("Page number, starting at 0"),
      name: z.string().min(1).optional().describe("Template name to find, case-insensitive"),
    },
    { readOnlyHint: true },
    // Default repeated here because the upstream CLI calls handlers without schema parsing.
    async ({ page = 0, name }) => {
      try {
        if (name !== undefined) {
          const { match, seen } = await findTemplateByName(name, page);
          return toolText(match ? [formatTemplate(match)] : notFoundText(name, seen));
        }
        const templates = await fetchTemplatePage(page);
        return toolText(templates.length ? [`page: ${page}`, ...templates.map(formatTemplate)] : ["No task templates."]);
      } catch (error) {
        return toolError("listing task templates", error);
      }
    }
  );
}

export function registerTaskTemplatesWrite(server: McpServer) {
  server.tool(
    CREATE_TASK_FROM_TEMPLATE_TOOL,
    [
      "Creates a task in a list from a task template, with the template's fields, checklists and subtasks.",
      "Give exactly one of template_id or template_name; a name is matched case-insensitively.",
    ].join("\n"),
    {
      list_id: z.string().min(1).describe("The list ID to create the task in"),
      name: z.string().min(1).describe("Name of the new task"),
      template_id: z.string().min(1).optional().describe("Task template ID, from getTaskTemplates"),
      template_name: z.string().min(1).optional().describe("Task template name, case-insensitive"),
    },
    async ({ list_id, name, template_id, template_name }) => {
      const action = "creating a task from a template";
      if ((template_id === undefined) === (template_name === undefined)) {
        return toolError(action, new Error("give exactly one of template_id or template_name"));
      }
      try {
        let templateId = template_id;
        if (template_name !== undefined) {
          const { match, seen } = await findTemplateByName(template_name);
          if (!match) return toolText(notFoundText(template_name, seen));
          templateId = match.id;
        }
        const url = `${CLICKUP_V2_BASE}/list/${encodeURIComponent(list_id)}/taskTemplate/${encodeURIComponent(templateId!)}`;
        const data = await clickupPost<any>(url, { name });
        const taskId = data?.id ?? data?.task?.id;
        if (!taskId) return toolText([`Task created from ${templateId}`]);
        const taskUrl = data?.url ?? data?.task?.url ?? `https://app.clickup.com/t/${taskId}`;
        return toolText([`Task created from ${templateId}`, `task_id: ${taskId}`, `url: ${taskUrl}`]);
      } catch (error) {
        return toolError(action, error);
      }
    }
  );
}
