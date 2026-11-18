// A name lookup reads at most this many template pages before it reports the names it saw.
export const TEMPLATE_SEARCH_MAX_PAGES = 5;
// Template pages are reused for one ClickUp rate-limit window, so repeated name lookups cost no extra calls.
export const TEMPLATE_PAGE_CACHE_MS = 60_000;
