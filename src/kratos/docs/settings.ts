export const SEARCH_DOCUMENTS_TOOL = "searchDocuments";
// ClickUp v3 parent_type codes for the places a doc can live in.
export const DOC_PARENT_TYPES = { space: 4, folder: 5, list: 6 } as const;
export const DOC_SEARCH_LIMIT_MIN = 10;
export const DOC_SEARCH_LIMIT_MAX = 100;
export const GET_DOCUMENT_PAGES_TOOL = "getDocumentPages";
// ClickUp reads -1 as every nesting level for Get Pages.
export const DOC_PAGES_ALL_DEPTH = -1;
