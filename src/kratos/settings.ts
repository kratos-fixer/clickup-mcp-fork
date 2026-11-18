export const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";
export const LIST_TASKS_BY_STATUS_TOOL = "listTasksByStatus";
// ClickUp's fixed page size for GET /list/{id}/task; it cannot be changed per request.
export const CLICKUP_TASK_PAGE_SIZE = 100;
export const GET_TASK_TEMPLATES_TOOL = "getTaskTemplates";
export const CREATE_TASK_FROM_TEMPLATE_TOOL = "createTaskFromTemplate";
export const GET_TASK_CHECKLISTS_TOOL = "getTaskChecklists";
export const CHECKLIST_WRITE_TOOLS = {
  createChecklist: "createChecklist",
  renameChecklist: "renameChecklist",
  deleteChecklist: "deleteChecklist",
  createChecklistItem: "createChecklistItem",
  editChecklistItem: "editChecklistItem",
  deleteChecklistItem: "deleteChecklistItem",
} as const;
