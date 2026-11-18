# ClickUp MCP for AI Assistants — community fork

> **This is a community fork of [hauptsacheNet/clickup-mcp](https://github.com/hauptsacheNet/clickup-mcp)**, based on upstream **v1.10.0**.
> It adds tools for comments, dependencies, checklists, attachments, Docs, task templates, task types and custom fields.
> Every upstream tool keeps its name, parameters and behaviour, so an existing MCP configuration keeps working.
>
> **Latest release:** [v1.10.0-kratos.1](https://github.com/kratos-fixer/kratos-clickup-mcp-fork/releases/tag/v1.10.0-kratos.1) · **Changes:** [CHANGELOG.md](CHANGELOG.md) · **Edits to upstream files:** [UPSTREAM-PATCHES.md](UPSTREAM-PATCHES.md)

Model Context Protocol (MCP) server enabling AI assistants to interact with ClickUp workspaces. Get complete task context with comments, images and attachments, search across projects, create and update tasks, manage checklists and dependencies, read and write Docs, collaborate through comments, and track time - all through natural language.

## Install the fork

The fork is **not published to npm**: `npx @hauptsache.net/clickup-mcp` installs upstream, without the tools below. Install it in one of these two ways.

You'll need:
- Your `CLICKUP_API_KEY` (Profile Icon > Settings > Apps > API Token ~ usually starts with pk_)
- Your `CLICKUP_TEAM_ID` (The 7–10 digit number in the URL when you are in the settings)

### Option 1: MCPB bundle (Claude Desktop)

Download `ClickUp.mcpb` from the [latest release](https://github.com/kratos-fixer/kratos-clickup-mcp-fork/releases/tag/v1.10.0-kratos.1) and open it in Claude Desktop. No Node.js installation is needed; a configuration screen asks for your API key and team ID.

### Option 2: Build from the release tag

Needs Node.js 16 or newer (CI uses Node 20):

```bash
git clone --branch v1.10.0-kratos.1 https://github.com/kratos-fixer/kratos-clickup-mcp-fork.git
cd kratos-clickup-mcp-fork
npm ci
npm run build
```

> Running the fork straight from GitHub (`npx github:kratos-fixer/kratos-clickup-mcp-fork#v1.10.0-kratos.1`) is not supported: the repository does not commit `dist/` and has no `prepare` script, so the package arrives unbuilt.

Then point your MCP client at the built server.

**Claude Desktop, Windsurf, Cursor and others** — add this to your MCP configuration file:

```json
{
  "mcpServers": {
    "clickup": {
      "command": "node",
      "args": ["/absolute/path/to/kratos-clickup-mcp-fork/dist/index.js"],
      "env": {
        "CLICKUP_API_KEY": "your_api_key",
        "CLICKUP_TEAM_ID": "your_team_id"
      }
    }
  }
}
```

Where to add it:
- **Claude Desktop**: Settings > Developer > Edit Config
- **Windsurf**: Add to your MCP configuration file
- **Cursor**: Configure through the MCP settings panel

**Claude Code (CLI):**
```bash
claude mcp add --scope user clickup \
  --env CLICKUP_API_KEY=YOUR_KEY \
  --env CLICKUP_TEAM_ID=YOUR_ID \
  --env CLICKUP_MCP_MODE=read-minimal \
  --env MAX_IMAGES=16 \
  --env MAX_RESPONSE_SIZE_MB=4 \
  -- node /absolute/path/to/kratos-clickup-mcp-fork/dist/index.js
```

> Claude Code can handle a lot of images, hence the higher limits. `read-minimal` suits coding work; pick another [mode](#mcp-modes--available-tools) if you need more tools.

**OpenAI Codex** — add these lines to `~/.codex/config.toml`:
```toml
[mcp_servers.clickup]
command = "node"
args = ["/absolute/path/to/kratos-clickup-mcp-fork/dist/index.js"]
env = { "CLICKUP_API_KEY" = "YOUR_KEY", "CLICKUP_TEAM_ID" = "YOUR_ID", "CLICKUP_MCP_MODE" = "read-minimal" }
```

> Codex seems to not be able to handle images from MCP's. See [this issue](https://github.com/openai/codex/issues/3741) for more details.

## Features

**🆕 marks what this fork adds**: a new tool, or a new parameter on an upstream tool. Unmarked tools work exactly as in upstream. The mode column names the lowest [mode](#mcp-modes--available-tools) that offers the tool: `read-minimal` < `read` < `write`.

### 💬 Comments

| Tool | Mode | What it does |
|------|------|--------------|
| 🆕 `resolveComment` | write | Marks a comment resolved, or reopens it with `resolved: false` |
| 🆕 `getTaskById` | read-minimal | Shows a `[resolved]` mark on resolved comments |
| `addComment` | write | Adds a comment, or replies inside a thread via `parent_comment_id` |
| `editComment` | write | Corrects your own comment within the edit window instead of posting a follow-up |

### 🔗 Dependencies & assignees

| Tool | Mode | What it does |
|------|------|--------------|
| 🆕 `addTaskDependency` | write | Adds one "waits on" / "blocks" link between two tasks (`direction: waits_on \| blocks`); every other dependency stays as it is |
| 🆕 `deleteTaskDependency` | write | Removes one such link, leaving the rest untouched |
| 🆕 `updateTask` `remove_assignees` | write | Removes users from a task, alone or together with `assignees` in one call |
| `updateTask` `waiting_on` / `blocking` / `linked_tasks` | write | Sets a task's dependencies and links as a whole |

### ☑️ Checklists

| Tool | Mode | What it does |
|------|------|--------------|
| 🆕 `getTaskChecklists` | read-minimal | Lists a task's checklists with items, ids and resolved state, nested items included |
| 🆕 `createChecklist` | write | Adds a checklist to a task |
| 🆕 `renameChecklist` | write | Renames a checklist |
| 🆕 `deleteChecklist` | write | Deletes a checklist |
| 🆕 `createChecklistItem` | write | Adds an item to a checklist |
| 🆕 `editChecklistItem` | write | Renames an item, or ticks / unticks it with `resolved` |
| 🆕 `deleteChecklistItem` | write | Deletes an item |

### 📎 Attachments

| Tool | Mode | What it does |
|------|------|--------------|
| 🆕 `getTaskById` | read-minimal | Adds an attachments block: each file's title, type, size, date and URL |
| 🆕 `uploadAttachment` | write | Attaches one file to a task without posting a comment: a local path, an image URL or a `data:` URI, with an optional `file_name`. Credential files, files over `MAX_UPLOAD_SIZE_MB` and non-image URLs are refused before anything is sent |
| `addComment` / `createTask` / `updateTask` | write | Upload images and files referenced as `![caption](path)` in markdown ([details](#writing-images-and-files-into-tickets)) |

### 📄 Docs

| Tool | Mode | What it does |
|------|------|--------------|
| 🆕 `searchDocuments` | read | Searches the workspace's Docs through ClickUp's v3 doc search; filter by space, folder or list, creator, deleted or archived, with cursor paging |
| 🆕 `getDocumentPages` | read | Reads every page of a doc in one call, nested pages included, in the doc's order; `page_ids` narrows it, `plain_text` returns plain text, long output is truncated with a note naming the pages left out |
| 🆕 `createDocumentOrPage` `folder_id` | write | Creates a new doc inside a folder (upstream: space or list) |
| 🆕 `updateDocumentPage` `prepend` | write | Adds content to the top of a page, next to upstream's replace and append |
| `readDocument` | read | Document details, page structure and content with navigation |

### 🧩 Task templates

| Tool | Mode | What it does |
|------|------|--------------|
| 🆕 `getTaskTemplates` | read-minimal | Lists the workspace's task templates page by page, or finds one by name |
| 🆕 `createTaskFromTemplate` | write | Creates a task in a list from a template given by `template_id` or `template_name` |

### 🏷️ Task types & Custom Task IDs

| Tool | Mode | What it does |
|------|------|--------------|
| 🆕 Custom Task IDs | read-minimal | IDs such as `ENG-302` work in every tool that takes a task ([details](#task-types-and-custom-task-ids)) |
| 🆕 `createTask` / `updateTask` `custom_item_id` | write | Sets the task type by number or by name, e.g. `"Bug"` |
| 🆕 `getTaskById` | read-minimal | Shows the task type |

### 🗂️ Custom fields

| Tool | Mode | What it does |
|------|------|--------------|
| 🆕 `getListCustomFields` | read | Lists a list's custom fields with ids, types, options and whether they are writable |
| 🆕 `createTask` / `updateTask` `custom_fields` | write | Reads and writes custom fields by name or id, with per-type value checks; `null` clears a field |

### 📋 Listing tasks by status

| Tool | Mode | What it does |
|------|------|--------------|
| 🆕 `listTasksByStatus` | read-minimal | Lists a list's tasks filtered by status names, 100 per page, with a `nextPage` pointer |
| `searchTasks` | read-minimal | Fuzzy search by content, keywords, assignees or project context |

Custom fields come from upstream PR [#38](https://github.com/hauptsacheNet/clickup-mcp/pull/38) by thystips; task types and Custom Task IDs from upstream PR [#42](https://github.com/hauptsacheNet/clickup-mcp/pull/42) by rsparkyc. Every change, with its PR, is in [CHANGELOG.md](CHANGELOG.md).

## This MCP vs Official ClickUp MCP

> See also: [Official ClickUp MCP Documentation](https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server)

| Feature              | This MCP                                              | Official ClickUp MCP                        |
|----------------------|-------------------------------------------------------|---------------------------------------------|
| **Setup**            | Local install (build from tag or MCPB bundle)         | Remote MCP (no install)                     |
| **Authentication**   | API key only                                          | OAuth only                                  |
| **Task Context**     | Complete with comments, status history, inline images, attachments, checklists | Requires mutiple tool calls for full contxt |
| **Image Support**    | Read and write: inline images with smart size budgeting, and `![](local/path.png)` uploads automatically | Upload via separate tool calls; base64 capped at ~200KB |
| **File Attachments** | `![Export](local/report.xlsx)` attaches Excel, CSV, PDF or any other file as a file card in comments; `uploadAttachment` attaches a file to a task directly; task attachments are listed when reading a task | Upload via separate tool call |
| **Search**           | Fuzzy search on recent tasks (limited scope)          | Full ClickUp search database                |
| **Documents**        | CRUD + document search + whole-doc page reads         | CRUD + document search                      |
| **Time Tracking**    | View and create entries                               | Timers and entries                          |
| **Chat Integration** | Not supported                                         | Supported                                   |
| **Connected Apps**   | Not supported                                         | Connected Search                            |
| **Best For**         | Coding tools, automation, context gathering           | Chat apps, task management                  |
| **Support**          | Community (open source)                               | Official ClickUp                            |

**Choose this MCP when:**
- You need rich task context with inline images for AI coding tools
- You want to write screenshots into tickets by local file path (running locally, it reads the file itself instead of taking base64)
- You need API key authentication for automation or CI/CD pipelines
- You want the `read-minimal` mode optimized for development workflows

**Choose Official MCP when:**
- You need OAuth authentication for enterprise security compliance
- You need Chat integration or Connected Search features
- You want official support and no local installation

## What You Can Do

Turn natural language into powerful ClickUp actions:

**Agentic Coding & Development:**
- *"Look at CU-abc123, can you find the relevant code?"*
- *"Can you build the dashboard like described in https://app.clickup.com/t/12a23b45c?"*
- *"Check task CU-xyz789 and fix the bugs mentioned in the comments"*
- *"Implement the API endpoints described in the integration task"*

**Time Tracking & Productivity:**
- *"Book 2 hours for the client meeting on the XYZ project"*
- *"How much time did I spend on development tasks this week?"*
- *"Log 30 minutes for code review on the authentication feature"*

**Smart Search & Discovery:**
- *"What task did I mention the CSV import in?"*
- *"Find all tasks related to the payment gateway integration"*
- *"Show me tasks where users reported login issues"*

**Daily Workflow Management:**
- *"What do I need to do today?"*
- *"Create a task for fixing the dashboard bug in the frontend list"*
- *"Update the API documentation task to 'in review' status"*
- *"What tasks are blocking the mobile app release?"*

**Rich Context & Collaboration:**
- *"Show me all comments on the user authentication task"*
- *"What's the latest update on the database migration?"*
- *"Add a comment to the design task about the new wireframes"*

**Document Management:**
- *"Find documents about job posting in hauptsache.net space"*
- *"Search for API documentation across all spaces"*
- *"Read the API documentation in the development space"*
- *"Create a new requirements document for the mobile app project"*
- *"Update the meeting notes with today's decisions"*
- *"What documents are in the product strategy space?"*

**Workflow Extras (this fork):**
- *"Tick off the 'write tests' item on CU-abc123's checklist"*
- *"Mark the design task as waiting on the API task"*
- *"Create a bug from the 'Bug report' template in the frontend list"*
- *"Attach /Users/me/exports/report.xlsx to the reporting task"*
- *"Read the whole onboarding doc, every page"*

## Key Features

### 🔍 **Intelligent Search**
- Fuzzy matching across task names, descriptions, and comments
- Multi-language search support for international teams
- Filter by assignees, projects, status, and metadata

### 💬 **Complete Context**
- Comment histories and team discussions (up to 250 top-level comments), including threaded comment replies
- Task descriptions with embedded images  
- List descriptions and project guidelines
- Document content with page navigation, or every page of a doc in one call
- Task attachments and checklists
- Access to complete task history and decisions

### ⏱️ **Time Tracking**
- Log time entries with descriptions
- View historical time logs and entries
- Query time entries by task or date range

### 📋 **Task & Document Management**
- Create and update tasks with markdown descriptions
- Create, read, and update documents and pages
- Add comments, reply in threads and resolve them
- Manage priorities, due dates, assignees, and tags
- Handle time estimates, custom field values and task types
- Manage checklists, dependencies and task templates

### 🔒 **Safety Features**
- **Appending is the default path for descriptions**: `append_description` adds a dated `**Edit (YYYY-MM-DD):**` section below the existing text; only an explicit `description` replaces the whole text, and the two cannot be combined in one call
- **List descriptions are append-only**: `updateListInfo` never overwrites existing content
- **Normal Field Updates**: Status, priority, assignees, tags, and dates can be updated normally (easily revertible through ClickUp's history)
- **Credential files are never uploaded** (see [Writing Images and Files Into Tickets](#writing-images-and-files-into-tickets))

## MCP Modes & Available Tools

The ClickUp MCP supports three operational modes to balance functionality, security, and performance:

- **🚀 `read-minimal`**: Perfect for AI coding assistants and context gathering
- **📖 `read`**: Full read-only access for project exploration and workflow understanding  
- **✏️ `write`** (Default): Complete functionality for task management and productivity workflows

🆕 = tool added by this fork.

| Tool                       | read-minimal | read | write | Description |
|----------------------------|:------------:|:----:|:-----:|-------------|
| `getTaskById`              |      ✅      |  ✅  |  ✅   | Complete task details: comments (with threaded replies and resolved marks), images, attachments, task type and metadata |
| `searchTasks`              |      ✅      |  ✅  |  ✅   | Find tasks by content, keywords, assignees, or project context |
| 🆕 `listTasksByStatus`     |      ✅      |  ✅  |  ✅   | A list's tasks filtered by status, 100 per page |
| 🆕 `getTaskChecklists`     |      ✅      |  ✅  |  ✅   | A task's checklists and items |
| 🆕 `getTaskTemplates`      |      ✅      |  ✅  |  ✅   | The workspace's task templates, or one by name |
| `searchSpaces`             |      ❌      |  ✅  |  ✅   | Browse workspace structure, project organization, and documents |
| `getListInfo`              |      ❌      |  ✅  |  ✅   | Get list details and available statuses for task creation |
| 🆕 `getListCustomFields`   |      ❌      |  ✅  |  ✅   | A list's custom fields (ids, types, options) - run this before setting them on tasks |
| `getTimeEntries`           |      ❌      |  ✅  |  ✅   | View time entries and analyze time spent across projects |
| `readDocument`             |      ❌      |  ✅  |  ✅   | Get document details, page structure, and content with navigation |
| 🆕 `searchDocuments`       |      ❌      |  ✅  |  ✅   | Search Docs through ClickUp's v3 doc search, filtered by location, creator or state |
| 🆕 `getDocumentPages`      |      ❌      |  ✅  |  ✅   | Every page of a doc in one call |
| `addComment`               |      ❌      |  ❌  |  ✅   | Add comments to tasks, or reply inside a comment thread via `parent_comment_id` |
| `editComment`              |      ❌      |  ❌  |  ✅   | Correct your own comment within 24h instead of posting a follow-up |
| 🆕 `resolveComment`        |      ❌      |  ❌  |  ✅   | Resolve or reopen a comment |
| `createTask`               |      ❌      |  ❌  |  ✅   | Create new tasks with full markdown support, custom fields and a task type |
| `updateTask`               |      ❌      |  ❌  |  ✅   | Update tasks (status, priority, assignees, custom fields, task type, etc.); descriptions can be appended to or replaced entirely |
| 🆕 `createTaskFromTemplate` |     ❌      |  ❌  |  ✅   | Create a task from a template |
| 🆕 `addTaskDependency`     |      ❌      |  ❌  |  ✅   | Add one dependency between two tasks |
| 🆕 `deleteTaskDependency`  |      ❌      |  ❌  |  ✅   | Remove one dependency between two tasks |
| 🆕 `createChecklist` / `renameChecklist` / `deleteChecklist` | ❌ | ❌ | ✅ | Manage a task's checklists |
| 🆕 `createChecklistItem` / `editChecklistItem` / `deleteChecklistItem` | ❌ | ❌ | ✅ | Manage checklist items, including ticking them |
| 🆕 `uploadAttachment`      |      ❌      |  ❌  |  ✅   | Attach a file to a task without a comment |
| `updateListInfo`           |      ❌      |  ❌  |  ✅   | **SAFE APPEND-ONLY** updates to list descriptions (preserves existing content) |
| `createTimeEntry`          |      ❌      |  ❌  |  ✅   | Log time entries for task tracking |
| `updateDocumentPage`       |      ❌      |  ❌  |  ✅   | Update existing page content or name with replace/append/prepend modes |
| `createDocumentOrPage`     |      ❌      |  ❌  |  ✅   | Create new documents (in a space, folder or list) with first page, or add pages/sub-pages |

### Setting the Mode

Add the mode to your MCP configuration:

```json
{
  "mcpServers": {
    "clickup": {
      "command": "node",
      "args": ["/absolute/path/to/kratos-clickup-mcp-fork/dist/index.js"],
      "env": {
        "CLICKUP_API_KEY": "your_api_key",
        "CLICKUP_TEAM_ID": "your_team_id",
        "CLICKUP_MCP_MODE": "read"
      }
    }
  }
}
```

## Configuration

This MCP server can be configured using environment variables. In the desktop extension (`.mcpb`) installer, the API key, team ID, primary language, upload size limit and comment edit window are offered as form fields; the remaining variables have to be set on the server environment directly.

- `CLICKUP_API_KEY`: (Required) Your ClickUp API key.
- `CLICKUP_TEAM_ID`: (Required) Your ClickUp Team ID (formerly Workspace ID).
- `CLICKUP_MCP_MODE`: (Optional) Controls which tools are available. Options: `read-minimal`, `read`, `write` (default).
- `MAX_IMAGES`: (Optional) The maximum number of images to return for a task in `getTaskById`. Defaults to 4.
- `MAX_RESPONSE_SIZE_MB`: (Optional) The maximum response size in megabytes for `getTaskById`. Uses intelligent size budgeting to fit the most important images within the limit. Defaults to 1.
- `MAX_UPLOAD_SIZE_MB`: (Optional) The maximum size of a single image or file uploaded when writing comments or descriptions. Defaults to 10.
- `CLICKUP_COMMENT_EDIT_WINDOW_HOURS`: (Optional) How long after creation `editComment` may still rewrite a comment. Defaults to 24. Set to `0` to disable comment editing entirely.
- `CLICKUP_PRIMARY_LANGUAGE`: (Optional) A hint for the primary language used in your ClickUp tasks (e.g., "de" for German, "en" for English). This helps the `searchTask` tool provide more tailored guidance in its description for multilingual searches.
- `LANG`: (Optional) If `CLICKUP_PRIMARY_LANGUAGE` is not set, the MCP will check this standard environment variable (e.g., "en_US.UTF-8", "de_DE") as a fallback to infer the primary language.

### Language-Aware Search Guidance

The `searchTask` tool's description will dynamically adjust based on the detected primary language:
- If `CLICKUP_PRIMARY_LANGUAGE` or `LANG` suggests a known primary language (e.g., German), the tool's description will specifically recommend providing search terms in both English and that detected language (e.g., German) for optimal results.
- If no primary language is detected, a more general recommendation for multilingual workspaces will be provided.

This feature aims to improve search effectiveness when the language of user queries (often English) differs from the language of the tasks in ClickUp, without making the MCP itself perform translations. The responsibility for providing bilingual search terms still lies with the agent calling the MCP, but the MCP offers more specific advice if it has a language hint.

## Markdown Formatting Support

Task descriptions and list documentation support full markdown formatting:

### Examples

**Task Creation with Markdown:**
```
Create a task called "API Integration" with description:
# API Integration Requirements

## Authentication
- Implement OAuth 2.0 flow
- Add JWT token validation
- **Priority**: High security standards

## Endpoints
1. `/api/users` - User management
2. `/api/data` - Data retrieval
3. `/api/webhook` - Event notifications

## Testing
- [ ] Unit tests for auth flow
- [ ] Integration tests
- [ ] Load testing with 1000+ concurrent users

> **Note**: This replaces the legacy REST implementation

See related task: https://app.clickup.com/t/abc123
```

**Appending to a description:**
`updateTask` with `append_description` adds a dated section and keeps the existing text:
```markdown
[Existing task description content]

---
**Edit (2024-01-15):** Added new acceptance criteria based on client feedback:
- Must support mobile responsive design
- Performance requirement: < 2s load time
```

To restructure, shorten or correct a description, pass `description` instead: it replaces the whole text, so read the task first and repeat everything worth keeping.

## Writing Images and Files Into Tickets

`addComment`, `editComment`, `createTask` and `updateTask` accept images as ordinary markdown. Because
this server runs locally, it reads the file itself - so a **local path is enough**:

```markdown
Ist umgesetzt. So sieht es aus:

**1. Login öffnen** – der Kunde gibt nur seine E-Mail-Adresse ein.

![Die Login-Maske fragt nur nach der E-Mail](/Users/me/shots/login.png)
```

Accepted sources: local file paths, `data:` URIs, http(s) URLs (downloaded, then
re-uploaded), and existing ClickUp attachment URLs (embedded without re-uploading).

**Any other file works the same way.** Excel and CSV exports are the typical case -
comments cannot render tables, so attaching the spreadsheet is usually the better choice:

```markdown
Die Auswertung für März liegt bei:

![Auswertung März](/Users/me/exports/auswertung-2026-03.xlsx)
```

Images render inline. Every other file becomes a **file card** in a comment (the same
card the ClickUp UI creates) and a plain link in a task description. ClickUp can preview
Excel, Word and PowerPoint files without downloading them, if the workspace enables the
[Preview Word, Excel, and Powerpoint files](https://help.clickup.com/hc/en-us/articles/37682636758551-Activate-the-Preview-Word-Excel-and-Powerpoint-files-in-ClickUp-ClickApp)
ClickApp. Reading a comment returns its file cards as `![name](url)`, so a comment read via
`getTaskById` can be passed back to `editComment` without losing them.

Notes:

- **Prefer paths over base64.** A path costs a few tokens; the same screenshot as a
  `data:` URI costs roughly 4/3 of its file size in the request.
- **The caption becomes the attachment filename**, and that filename is what ClickUp
  displays beneath the image or on the file card - so write a caption that reads well.
  The source's extension is kept (`![Auswertung](x.xlsx)` uploads `Auswertung.xlsx`).
- **An image inside a numbered list breaks ClickUp's numbering.** Write walkthrough
  steps as bold lines with the image between them, as above.
- Images are recognised by their content: a `.png`/`.jpg`/`.gif`/`.webp` that is not a
  real image is rejected instead of being attached as a broken image.
- **Credential files are never uploaded**: dotfiles (`.env`, `.npmrc`, ...), private keys
  (`id_rsa`, `*.pem`, `*.key`, ...) and anything under `.ssh`, `.aws`, `.gnupg`, `.kube`,
  `.docker` or `.azure`. Symlinks are resolved first and checked by their target, only
  regular files are read, and `/proc`, `/sys` and `/dev` are refused (`/proc/self/environ`
  would otherwise expose the API key).
- **Only images are taken from http(s) URLs.** Other files must come from a local path
  or a `data:` URI - otherwise a prompt injection could point at an internal service
  (`localhost`, a cloud metadata endpoint) and get its response attached to the ticket.
- A reference that fails **aborts the write**: `addComment`, `editComment` and
  `updateTask` report every broken reference and change nothing, so the markdown can be
  fixed and the call retried without creating duplicates. `createTask` validates its
  images before creating the task; only an upload failing afterwards is reported as a
  warning, since the task already exists at that point.
- Attachments always belong to a task, so document pages cannot embed uploads this way.
- To attach a file without writing a comment, use `uploadAttachment`. It applies the same credential-file and URL rules, and the `MAX_UPLOAD_SIZE_MB` limit.

## Task Types and Custom Task IDs

**Custom Task IDs.** If the workspace uses the
[Custom Task IDs](https://help.clickup.com/hc/en-us/articles/6309943321751-Use-Custom-Task-IDs) ClickApp,
every tool that takes a task (`getTaskById`, `updateTask`, `addComment`, `editComment`,
`getTimeEntries`, `createTimeEntry`, `parent_task_id` on `createTask`, `parent_task_id`,
`waiting_on`, `blocking` and `linked_tasks` on `updateTask`, and `searchTasks` terms) also accepts the custom ID, e.g. `ENG-302`. It is
resolved once via `?custom_task_ids=true&team_id=<CLICKUP_TEAM_ID>` (cached for a minute)
and the generated ID is used from then on. `getTaskById`, `createTask` and `updateTask` show
`task_id` and, when ClickUp has assigned one, `custom_id`; `createTask` may omit it when ClickUp
has not assigned it within about 3 s.

**Task types** (`write` mode). `custom_item_id` on `createTask` and `updateTask` sets the
task type, either as the numeric ID (e.g. `1006`) or by name (e.g. `"Bug"`, resolved via
`GET /team/{team_id}/custom_item`). `0` / `"Task"` is the default type. An unknown name
aborts before anything is written. `getTaskById` shows it as
`task_type: Bug (custom_item_id: 1006)`.

## Performance & Limitations

**Optimized for AI Workflows:**
- **Smart Image Processing**: Intelligent size budgeting prioritizes the most recent images while respecting both count (`MAX_IMAGES`, default: 4) and total response size limits (`MAX_RESPONSE_SIZE_MB`, default: 1MB)
- **Search Scope**: Searches within the most recent 1000-3000 tasks to prevent running into rate limits (exact number varies by endpoint)
- **Search Results**: Returns up to 50 most relevant matches to prevent flooding the agent with too many results

**Current Scope:**
- Focused on task-level operations rather than bulk workspace management
- Optimized for conversational AI workflows rather than data migration
- Designed for productivity enhancement, not administrative operations

These limitations ensure reliable performance while covering the most common use cases for both development context and productivity management.

## Credits

All the groundwork is [hauptsacheNet/clickup-mcp](https://github.com/hauptsacheNet/clickup-mcp) by Marco Pfeiffer (Nemo64) and its contributors. Thank you!

## License

MIT
