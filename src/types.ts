import { z } from "zod";

export const AgentIdentifierSchema = z.string().min(1).max(64);

export const AgentPromptSchema = z.object({
  task: AgentIdentifierSchema.optional().describe("Task identifier for tracking this prompt"),
  prompt: z.string().min(1, "prompt must not be empty").describe("The prompt to send to the agent"),
  extraArgs: z.array(z.string()).optional().describe("Additional CLI arguments to pass to the agent"),
  timeoutMs: z.number().int().positive().max(10 * 60 * 1000).optional().describe("Timeout in milliseconds (max 10 minutes)"),
  model: z.string().optional().describe("Model to use (e.g., 'gpt-4', 'gemini-2.5-pro')"),
  workingDirectory: z.string().optional().describe("Directory path where agent should run. Use this to access different projects")
});

// Schema without agentEnv - base schema for both tools
const BaseInvokeSchema = z.object({
  prompts: z.array(AgentPromptSchema).min(1, "provide at least one prompt").describe("Array of prompts to execute"),
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(1)
    .describe("Number of prompts to run in parallel (1-10, default: 1)"),
  includeRawEvents: z.boolean().default(false).describe("Include raw output and events in response")
});

// Keep original for backward compatibility
export const BatchInvokeSchema = z.object({
  prompts: z.array(AgentPromptSchema).min(1, "provide at least one prompt"),
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(16)
    .default(2),
  agentEnv: z.enum(["codex", "gemini"]).default("codex"),
  includeRawEvents: z.boolean().default(false)
});

// Specific schemas for each tool
export const CodexInvokeSchema = BaseInvokeSchema;
export const GeminiInvokeSchema = BaseInvokeSchema;

export type AgentPromptInput = z.infer<typeof AgentPromptSchema>;
export type BatchInvokeInput = z.infer<typeof BatchInvokeSchema>;

export interface AgentInvocationSuccess {
  status: "ok";
  task?: string;
  prompt: string;
  agent: string;
  response: string;
  exitCode: number;
  durationMs: number;
  rawEvents?: unknown[];
  rawOutput?: string;
  stderr?: string;
}

export interface AgentInvocationErrorResult {
  status: "error";
  task?: string;
  prompt: string;
  agent: string;
  error: string;
  exitCode?: number;
  rawOutput?: string;
  stderr?: string;
}

export type AgentInvocationResult = AgentInvocationSuccess | AgentInvocationErrorResult;
