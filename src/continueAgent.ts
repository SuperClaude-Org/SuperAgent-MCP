import spawn from "cross-spawn";
import { once } from "node:events";
import { createHeartbeat } from "./heartbeat.js";
import { registerProcess } from "./processManager.js";

export interface ContinueInvocationOptions {
  prompt: string;
  agentSystemPrompt?: string;
  timeoutMs?: number;
  workingDirectory?: string;
  includeRawEvents?: boolean;
  progressToken?: string | number;
  mcpServer?: any;
}

export interface ContinueInvocationResponse {
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  response: string;
}

export class ContinueInvocationError extends Error {
  public readonly stdout: string;
  public readonly stderr: string;
  public readonly exitCode: number;

  constructor(message: string, exitCode: number, stdout: string, stderr: string) {
    super(message);
    this.name = "ContinueInvocationError";
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const META_INSTRUCTION = `You are an MCP-invoked agent. Your responses should be:
- Concise but complete
- Focus on the requested task
- Do what has been asked, nothing more, nothing less

You are a general-purpose agent capable of:
- Code analysis and modification
- Documentation tasks
- Multi-step research
- System exploration

User request: `;

function parseContinueResponse(stdout: string): string {
  // Continue CLI outputs plain text in headless mode
  return stdout.trim();
}

export async function invokeContinue(options: ContinueInvocationOptions): Promise<ContinueInvocationResponse> {
  const start = Date.now();

  // Create heartbeat controller to prevent MCP timeout
  const heartbeat = options.mcpServer && options.progressToken
    ? createHeartbeat({
        intervalMs: 30000,
        progressToken: options.progressToken,
        server: options.mcpServer
      })
    : null;

  // Get config path from environment variable
  const configPath = process.env.CONTINUE_CONFIG_PATH;
  if (!configPath) {
    throw new ContinueInvocationError(
      "CONTINUE_CONFIG_PATH environment variable is required",
      -1,
      "",
      "Missing CONTINUE_CONFIG_PATH environment variable"
    );
  }

  // Build full prompt with proper hierarchy
  const fullPrompt = META_INSTRUCTION +
    (options.agentSystemPrompt ? options.agentSystemPrompt + "\n\nUser request:\n" : "") +
    options.prompt;

  // Escape newlines for proper prompt transmission
  const escapedPrompt = fullPrompt
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  // Build args array for cross-spawn
  const args = ["--config", configPath, "-p", escapedPrompt];

  const child = spawn("cn", args, {
    cwd: options.workingDirectory ?? process.cwd(),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"]
  });

  // Register process for cleanup on shutdown
  registerProcess(child);

  // Start heartbeat after spawn
  heartbeat?.start();

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout!.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr!.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

  // Continue doesn't use stdin for prompts
  child.stdin!.end();

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ContinueInvocationError(
        `Continue invocation timed out after ${timeoutMs}ms`,
        -1,
        Buffer.concat(stdoutChunks).toString("utf8"),
        Buffer.concat(stderrChunks).toString("utf8")
      ));
    }, timeoutMs);
  });

  let closeResult: [number | null, NodeJS.Signals | null];
  try {
    closeResult = (await Promise.race([once(child, "close"), timeoutPromise])) as [number | null, NodeJS.Signals | null];
  } finally {
    // Stop heartbeat
    heartbeat?.stop();

    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }

  const durationMs = Date.now() - start;
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");

  const exitCode = closeResult[0] ?? 0;

  if (exitCode !== 0) {
    throw new ContinueInvocationError(
      `Continue exited with code ${exitCode}`,
      exitCode,
      stdout,
      stderr
    );
  }

  const response = parseContinueResponse(stdout);

  return {
    exitCode,
    durationMs,
    stdout,
    stderr,
    response
  };
}
