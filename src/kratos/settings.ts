export const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";
export const LIST_TASKS_BY_STATUS_TOOL = "listTasksByStatus";
// ClickUp's fixed page size for GET /list/{id}/task; it cannot be changed per request.
export const CLICKUP_TASK_PAGE_SIZE = 100;
export const SEARCH_DOCUMENTS_TOOL = "searchDocuments";
// ClickUp v3 parent_type codes for the places a doc can live in.
export const DOC_PARENT_TYPES = { space: 4, folder: 5, list: 6 } as const;
export const DOC_SEARCH_LIMIT_MIN = 10;
export const DOC_SEARCH_LIMIT_MAX = 100;
