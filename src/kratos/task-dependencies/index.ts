import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CLICKUP_V2_BASE, clickupDelete, clickupPost, toolError, toolText } from "../clickup-api";
import { ADD_TASK_DEPENDENCY_TOOL, DELETE_TASK_DEPENDENCY_TOOL } from "./settings";

export { ADD_TASK_DEPENDENCY_TOOL, DELETE_TASK_DEPENDENCY_TOOL };

export type DependencyDirection = "waits_on" | "blocks";

export interface DependencyInput {
  task_id: string;
  other_task_id: string;
  direction: DependencyDirection;
}

// Both directions are sent as depends_on on the waiting task, so add and delete use one form.
export function dependencyPair({ task_id, other_task_id, direction }: DependencyInput) {
  return direction === "waits_on"
    ? { waiting: task_id, blocking: other_task_id }
    : { waiting: other_task_id, blocking: task_id };
}

function dependencyUrl(waiting: string): string {
  return `${CLICKUP_V2_BASE}/task/${encodeURIComponent(waiting)}/dependency`;
}

function resultLine(waiting: string, blocking: string, outcome: "added" | "removed"): string {
  const urls = `https://app.clickup.com/t/${waiting}, https://app.clickup.com/t/${blocking}`;
  return `task ${waiting} waits on ${blocking}: ${outcome} (${urls})`;
}

export async function addTaskDependency(input: DependencyInput): Promise<string> {
  const { waiting, blocking } = dependencyPair(input);
  await clickupPost(dependencyUrl(waiting), { depends_on: blocking });
  return resultLine(waiting, blocking, "added");
}

export async function deleteTaskDependency(input: DependencyInput): Promise<string> {
  const { waiting, blocking } = dependencyPair(input);
  await clickupDelete(dependencyUrl(waiting), { depends_on: blocking });
  return resultLine(waiting, blocking, "removed");
}

const dependencySchema = {
  task_id: z.string().min(1).describe("The task this call is about"),
  other_task_id: z.string().min(1).describe("The task on the other side of the dependency"),
  direction: z
    .enum(["waits_on", "blocks"])
    .describe("waits_on: task_id waits on other_task_id. blocks: task_id blocks other_task_id"),
};

const singleChangeNote = [
  "Exactly one dependency changes; every other dependency of both tasks stays as it is.",
  "Use this instead of updateTask waiting_on / blocking when changing a single dependency.",
];

export function registerTaskDependencyTools(server: McpServer) {
  server.tool(
    ADD_TASK_DEPENDENCY_TOOL,
    ["Adds one dependency between two tasks.", ...singleChangeNote].join("\n"),
    dependencySchema,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async (input) => {
      try {
        return toolText([await addTaskDependency(input)]);
      } catch (error) {
        return toolError("adding task dependency", error);
      }
    },
  );

  server.tool(
    DELETE_TASK_DEPENDENCY_TOOL,
    ["Removes one dependency between two tasks.", ...singleChangeNote].join("\n"),
    dependencySchema,
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async (input) => {
      try {
        return toolText([await deleteTaskDependency(input)]);
      } catch (error) {
        return toolError("removing task dependency", error);
      }
    },
  );
}
