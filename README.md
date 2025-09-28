# SuperAgent MCP

MCP server for orchestrating Codex and Gemini CLI agents with parallel execution support.

## Tools

### codex
Run Codex CLI agent with parallel execution. Supports multiple prompts concurrently. Use workingDirectory to access different project folders. Codex has full system access.

### gemini
Run Gemini CLI agent with parallel execution. Supports multiple prompts concurrently. Use workingDirectory to access different project folders. Auto-approves all actions (YOLO mode).

## Installation

```bash
npm install @superclaude-org/superagent
```

## Usage

Configure in Claude Desktop or compatible MCP client.

## Requirements

- Node.js 18+
- Codex CLI installed
- Gemini CLI installed