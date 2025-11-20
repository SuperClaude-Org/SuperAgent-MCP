# SuperAgent MCP

SuperAgent is a Model Context Protocol (MCP) server that bridges MCP-compatible clients with the Codex, Gemini, and Continue CLI agents. It lets you fan out multiple CLI tasks in parallel, reuse curated system prompts, and surface results back to your client in a single, structured response.

## Key Features
- **Unified agent runner**: expose the Codex, Gemini, and Continue CLIs as MCP tools without additional wrappers.
- **Parallel execution**: run multiple prompts concurrently with per-task timeouts and basic result formatting.
- **Agent library sync**: ship ready-made system prompts that install into `~/.superagent/agents` and can be extended locally.
- **Tool discovery**: query the bundled `list-agents` tool to see which specialized agents are available at runtime.

## Installation

```bash
npm install @superclaude-org/superagent
```

The postinstall script seeds any missing agent definition files under `~/.superagent/agents` so they are immediately 

Once connected, the client will discover these tools:

| Tool | Purpose | Notable arguments |
| --- | --- | --- |
| `codex` | Run one or many Codex CLI tasks in parallel. | `inputs[]` (prompt list), `concurrency`, `workingDirectory`, `agent`, `extraArgs`, `timeoutMs` |
| `gemini` | Run Gemini CLI tasks with auto-approval enabled. | `inputs[]`, `concurrency`, `workingDirectory`, `agent`, `timeoutMs` |
| `continue` | Run Continue CLI tasks with headless mode. Requires `CONTINUE_CONFIG_PATH` environment variable. | `inputs[]`, `concurrency`, `workingDirectory`, `agent`, `timeoutMs` |
| `list-agents` | List the specialized agents available to all tools. | *(none)* |

### Invoking a tool
```json
{
  "tool": "codex",
  "arguments": {
    "concurrency": 2,
    "inputs": [
      { "prompt": "Run unit tests", "workingDirectory": "/path/to/app" },
      { "prompt": "Summarize latest git changes", "agent": "technical-writer" }
    ]
  }
}
```

## Agent Management
- Agent definitions are Markdown files with frontmatter. You can edit or add new files in `~/.superagent/agents`.
- The `list-agents` tool shows each agent's name and description so you can supply the `agent` field when invoking `codex`, `gemini`, or `continue`.
- Files shipped with the package are copied only if they do not already exist, preserving local customizations.

## Continue Configuration
To use the `continue` tool, set the `CONTINUE_CONFIG_PATH` environment variable to point to your Continue config file:
```bash
export CONTINUE_CONFIG_PATH="/path/to/.continue/config.yaml"
```
This can be set in your MCP client configuration's `env` section.

## Development

```bash
npm install
npm run build
npm start   # runs the compiled server
npm run dev # runs the TypeScript entrypoint with ts-node
```

Requires Node.js 18 or newer.
