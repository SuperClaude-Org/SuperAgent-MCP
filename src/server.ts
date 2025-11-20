#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent
} from "@modelcontextprotocol/sdk/types.js";
import { CodexInvokeSchema, GeminiInvokeSchema, ContinueInvokeSchema } from "./types.js";
import { runCodexBatch, runGeminiBatch, runContinueBatch } from "./runner.js";
import { formatAgentsForDescription, ensureAgentsDirectory, loadAgents } from "./agentLoader.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

// Color codes for tasks (1-16)
const TASK_COLORS = [
  '\x1b[34m', // 1: Blue
  '\x1b[32m', // 2: Green
  '\x1b[33m', // 3: Yellow
  '\x1b[35m', // 4: Magenta
  '\x1b[36m', // 5: Cyan
  '\x1b[31m', // 6: Red
  '\x1b[94m', // 7: Bright Blue
  '\x1b[92m', // 8: Bright Green
  '\x1b[93m', // 9: Bright Yellow
  '\x1b[95m', // 10: Bright Magenta
  '\x1b[96m', // 11: Bright Cyan
  '\x1b[91m', // 12: Bright Red
  '\x1b[90m', // 13: Bright Black (Gray)
  '\x1b[37m', // 14: White
  '\x1b[97m', // 15: Bright White
  '\x1b[39m'  // 16: Default
];
const RESET_COLOR = '\x1b[0m';

const CODEX_TOOL = "codex";
const GEMINI_TOOL = "gemini";
const CONTINUE_TOOL = "continue";

// Dynamically create tool definitions with available agents
const LIST_AGENTS_TOOL = "list-agents";

function createToolDefinitions(): { codex: Tool, gemini: Tool, continue: Tool, listAgents: Tool } {
  const agentsList = formatAgentsForDescription();

  return {
    codex: {
      name: CODEX_TOOL,
      description: "Run Codex CLI agent with parallel execution. Supports multiple tasks concurrently. Use 'workingDirectory' to access different project folders. Codex has full system access. Use 'agent' parameter to invoke a specific agent (run 'list-agents' to see available agents).",
      inputSchema: zodToJsonSchema(CodexInvokeSchema) as Tool["inputSchema"]
    },
    gemini: {
      name: GEMINI_TOOL,
      description: "Run Gemini CLI agent with parallel execution. Supports multiple tasks concurrently. Use 'workingDirectory' to access different project folders. Auto-approves all actions (YOLO mode). Use 'agent' parameter to invoke a specific agent (run 'list-agents' to see available agents).",
      inputSchema: zodToJsonSchema(GeminiInvokeSchema) as Tool["inputSchema"]
    },
    continue: {
      name: CONTINUE_TOOL,
      description: "Run Continue CLI agent with parallel execution. Supports multiple tasks concurrently. Use 'workingDirectory' to access different project folders. Requires CONTINUE_CONFIG_PATH environment variable to be set. Use 'agent' parameter to invoke a specific agent (run 'list-agents' to see available agents).",
      inputSchema: zodToJsonSchema(ContinueInvokeSchema) as Tool["inputSchema"]
    },
    listAgents: {
      name: LIST_AGENTS_TOOL,
      description: "List all available specialized agents for use with codex, gemini, and continue tools" + agentsList,
      inputSchema: zodToJsonSchema(z.object({})) as Tool["inputSchema"]
    }
  };
}

const server = new Server(
  {
    name: "SuperAgent",
    version: "0.1.8"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// @ts-expect-error MCP SDK type mismatch
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = createToolDefinitions();
  return {
    tools: [tools.codex, tools.gemini, tools.continue, tools.listAgents]
  };
});

// @ts-expect-error MCP SDK type mismatch
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // @ts-expect-error
  const { name: toolName, arguments: args = {} } = request.params;

  if (toolName === LIST_AGENTS_TOOL) {
    const agents = loadAgents();
    const agentList = agents
      .map(a => `• ${a.name}: ${a.description}`)
      .join('\n');

    return {
      content: [
        {
          type: "text",
          text: `Available specialized agents:\n\n${agentList}\n\nUse any of these agents with the 'agent' parameter in codex, gemini, or continue tools.`
        } satisfies TextContent
      ]
    };
  }

  if (toolName === CODEX_TOOL) {
    const parsed = CodexInvokeSchema.parse(args);
    const results = await runCodexBatch(parsed);

    // Format results as clean text
    const resultParts: string[] = [];

    resultParts.push(`=== Codex Agent Execution ===`);
    resultParts.push(`Concurrency: ${parsed.concurrency}`);
    resultParts.push(``);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const taskColor = TASK_COLORS[i % TASK_COLORS.length];
      const taskName = result.agent || `Task-${i + 1}`;

      if (result.status === "ok") {
        resultParts.push(`${taskColor}━━━ Task: ${taskName} ━━━${RESET_COLOR}`);
        resultParts.push(`Status: ✓ Success (${result.durationMs}ms)`);
        resultParts.push(`Response:`);
        if (result.response) {
          resultParts.push(`  ${result.response.split('\n').join('\n  ')}`);
        }

        // Show raw output if includeRawEvents is true
        if (result.rawOutput) {
          resultParts.push(`\n[Raw JSON Events - First 5 lines]`);
          const lines = result.rawOutput.split('\n').filter(l => l.trim());
          lines.slice(0, 5).forEach(line => {
            resultParts.push(`  ${line}`);
          });
          if (lines.length > 5) {
            resultParts.push(`  ... (${lines.length - 5} more lines)`);
          }
        }

        resultParts.push(``);
      } else {
        resultParts.push(`${taskColor}━━━ Task: ${taskName} ━━━${RESET_COLOR}`);
        resultParts.push(`Status: ✗ Failed`);
        if (result.error) {
          resultParts.push(`Error:`);
          resultParts.push(`  ${result.error.split('\n').join('\n  ')}`);
        }
        resultParts.push(``);
      }
    }

    return {
      content: [
        {
          type: "text",
          text: resultParts.join("\n")
        } satisfies TextContent
      ]
    };
  } else if (toolName === GEMINI_TOOL) {
    const parsed = GeminiInvokeSchema.parse(args);
    const results = await runGeminiBatch(parsed);

    // Format results as clean text
    const resultParts: string[] = [];

    resultParts.push(`=== Gemini Agent Execution ===`);
    resultParts.push(`Concurrency: ${parsed.concurrency}`);
    resultParts.push(``);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const taskColor = TASK_COLORS[i % TASK_COLORS.length];
      const taskName = result.agent || `Task-${i + 1}`;

      if (result.status === "ok") {
        resultParts.push(`${taskColor}━━━ Task: ${taskName} ━━━${RESET_COLOR}`);
        resultParts.push(`Status: ✓ Success (${result.durationMs}ms)`);
        resultParts.push(`Response:`);
        if (result.response) {
          resultParts.push(`  ${result.response.split('\n').join('\n  ')}`);
        }

        // Show raw output if includeRawEvents is true
        if (result.rawOutput) {
          resultParts.push(`\n[Raw JSON Events - First 5 lines]`);
          const lines = result.rawOutput.split('\n').filter(l => l.trim());
          lines.slice(0, 5).forEach(line => {
            resultParts.push(`  ${line}`);
          });
          if (lines.length > 5) {
            resultParts.push(`  ... (${lines.length - 5} more lines)`);
          }
        }

        resultParts.push(``);
      } else {
        resultParts.push(`${taskColor}━━━ Task: ${taskName} ━━━${RESET_COLOR}`);
        resultParts.push(`Status: ✗ Failed`);
        if (result.error) {
          resultParts.push(`Error:`);
          resultParts.push(`  ${result.error.split('\n').join('\n  ')}`);
        }
        resultParts.push(``);
      }
    }

    return {
      content: [
        {
          type: "text",
          text: resultParts.join("\n")
        } satisfies TextContent
      ]
    };
  } else if (toolName === CONTINUE_TOOL) {
    const parsed = ContinueInvokeSchema.parse(args);
    const results = await runContinueBatch(parsed);

    // Format results as clean text
    const resultParts: string[] = [];

    resultParts.push(`=== Continue Agent Execution ===`);
    resultParts.push(`Concurrency: ${parsed.concurrency}`);
    resultParts.push(``);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const taskColor = TASK_COLORS[i % TASK_COLORS.length];
      const taskName = result.agent || `Task-${i + 1}`;

      if (result.status === "ok") {
        resultParts.push(`${taskColor}━━━ Task: ${taskName} ━━━${RESET_COLOR}`);
        resultParts.push(`Status: ✓ Success (${result.durationMs}ms)`);
        resultParts.push(`Response:`);
        if (result.response) {
          resultParts.push(`  ${result.response.split('\n').join('\n  ')}`);
        }

        // Show raw output if includeRawEvents is true
        if (result.rawOutput) {
          resultParts.push(`\n[Raw Output - First 5 lines]`);
          const lines = result.rawOutput.split('\n').filter(l => l.trim());
          lines.slice(0, 5).forEach(line => {
            resultParts.push(`  ${line}`);
          });
          if (lines.length > 5) {
            resultParts.push(`  ... (${lines.length - 5} more lines)`);
          }
        }

        resultParts.push(``);
      } else {
        resultParts.push(`${taskColor}━━━ Task: ${taskName} ━━━${RESET_COLOR}`);
        resultParts.push(`Status: ✗ Failed`);
        if (result.error) {
          resultParts.push(`Error:`);
          resultParts.push(`  ${result.error.split('\n').join('\n  ')}`);
        }
        resultParts.push(``);
      }
    }

    return {
      content: [
        {
          type: "text",
          text: resultParts.join("\n")
        } satisfies TextContent
      ]
    };
  } else {
    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${toolName}`
        }
      ],
      isError: true
    };
  }
});

async function main() {
  // Ensure agents directory exists
  ensureAgentsDirectory();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SuperAgent MCP server ready (Codex, Gemini & Continue)");
}

main().catch((error: unknown) => {
  console.error("SuperAgent MCP server failed to start", error);
  process.exit(1);
});