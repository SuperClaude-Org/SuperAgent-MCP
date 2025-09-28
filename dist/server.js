#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CodexInvokeSchema, GeminiInvokeSchema } from "./types.js";
import { runCodexBatch, runGeminiBatch } from "./runner.js";
import { zodToJsonSchema } from "zod-to-json-schema";
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
    '\x1b[39m' // 16: Default
];
const RESET_COLOR = '\x1b[0m';
const CODEX_TOOL = "codex";
const GEMINI_TOOL = "gemini";
const codexToolDefinition = {
    name: CODEX_TOOL,
    description: "Run Codex CLI agent with parallel execution. Supports multiple prompts concurrently. Use 'workingDirectory' to access different project folders. Codex has full system access.",
    inputSchema: zodToJsonSchema(CodexInvokeSchema)
};
const geminiToolDefinition = {
    name: GEMINI_TOOL,
    description: "Run Gemini CLI agent with parallel execution. Supports multiple prompts concurrently. Use 'workingDirectory' to access different project folders. Auto-approves all actions (YOLO mode).",
    inputSchema: zodToJsonSchema(GeminiInvokeSchema)
};
const server = new Server({
    name: "SuperAgent",
    version: "0.2.0"
}, {
    capabilities: {
        tools: {}
    }
});
// @ts-expect-error MCP SDK type mismatch
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [codexToolDefinition, geminiToolDefinition]
}));
// @ts-expect-error MCP SDK type mismatch
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // @ts-expect-error
    const { name: toolName, arguments: args = {} } = request.params;
    if (toolName === CODEX_TOOL) {
        const parsed = CodexInvokeSchema.parse(args);
        const results = await runCodexBatch(parsed);
        // Format results as clean text
        const resultParts = [];
        resultParts.push(`=== Codex Agent Execution ===`);
        resultParts.push(`Concurrency: ${parsed.concurrency}`);
        resultParts.push(``);
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const taskColor = TASK_COLORS[i % TASK_COLORS.length];
            const taskName = result.task || `Task-${i + 1}`;
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
            }
            else {
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
                }
            ]
        };
    }
    else if (toolName === GEMINI_TOOL) {
        const parsed = GeminiInvokeSchema.parse(args);
        const results = await runGeminiBatch(parsed);
        // Format results as clean text
        const resultParts = [];
        resultParts.push(`=== Gemini Agent Execution ===`);
        resultParts.push(`Concurrency: ${parsed.concurrency}`);
        resultParts.push(``);
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const taskColor = TASK_COLORS[i % TASK_COLORS.length];
            const taskName = result.task || `Task-${i + 1}`;
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
            }
            else {
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
                }
            ]
        };
    }
    else {
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
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("SuperAgent MCP server ready (Codex & Gemini)");
}
main().catch((error) => {
    console.error("SuperAgent MCP server failed to start", error);
    process.exit(1);
});
