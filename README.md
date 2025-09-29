# SuperAgent MCP

SuperAgent is a Model Context Protocol (MCP) server that bridges MCP-compatible clients with the Codex and Gemini CLI agents. It lets you fan out multiple CLI tasks in parallel, reuse curated system prompts, and surface results back to your client in a single, structured response.

## Key Features
- **Unified agent runner**: expose the Codex and Gemini CLIs as MCP tools without additional wrappers.
- **Parallel execution**: run multiple prompts concurrently with per-task timeouts and basic result formatting.
- **Agent library sync**: ship ready-made system prompts that install into `~/.superagent/agents` and can be extended locally.
- **Tool discovery**: query the bundled `list-agents` tool to see which specialized agents are available at runtime.

## Installation

```bash
npm install @superclaude-org/superagent
```

The postinstall script seeds any missing agent definition files under `~/.superagent/agents` so they are immediately available.

## Quick Start
1. Make sure the Codex CLI and Gemini CLI are installed on the machine where the MCP server will run.
2. Launch the server with `npx superagent` (or add `superagent` to your MCP client's server list).
3. In your MCP client (e.g. Claude Desktop), register the server binary and enable the tools you need.

### Example Claude Desktop entry (YAML)
```yaml
- id: superagent
  name: SuperAgent MCP
  command: npx superagent
```

Once connected, the client will discover these tools:

| Tool | Purpose | Notable arguments |
| --- | --- | --- |
| `codex` | Run one or many Codex CLI tasks in parallel. | `inputs[]` (prompt list), `concurrency`, `workingDirectory`, `agent`, `extraArgs`, `timeoutMs` |
| `gemini` | Run Gemini CLI tasks with auto-approval enabled. | `inputs[]`, `concurrency`, `workingDirectory`, `agent`, `timeoutMs` |
| `list-agents` | List the specialized agents available to both tools. | *(none)* |

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
- The `list-agents` tool shows each agent’s name and description so you can supply the `agent` field when invoking `codex` or `gemini`.
- Files shipped with the package are copied only if they do not already exist, preserving local customizations.

## Development

```bash
npm install
npm run build
npm start   # runs the compiled server
npm run dev # runs the TypeScript entrypoint with ts-node
```

Requires Node.js 18 or newer.
