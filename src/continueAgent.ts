import { spawn } from "node:child_process";
import { once } from "node:events";

export interface ContinueInvocationOptions {
  prompt: string;
  agentSystemPrompt?: string;
  timeoutMs?: number;
  workingDirectory?: string;
  includeRawEvents?: boolean;
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

function buildArgs(options: ContinueInvocationOptions): string[] {
  const args: string[] = [];

  // Get config path from environment variable
  const configPath = process.env.CONTINUE_CONFIG_PATH;
  if (configPath) {
    args.push("--config", configPath);
  }

  // Build full prompt with proper hierarchy
  const fullPrompt = META_INSTRUCTION +
    (options.agentSystemPrompt ? options.agentSystemPrompt + "\n\nUser request:\n" : "") +
    options.prompt;

  // Add headless mode flag with prompt
  args.push("-p", fullPrompt);

  return args;
}

function parseContinueResponse(stdout: string): string {
  // Continue CLI outputs plain text in headless mode
  return stdout.trim();
}

export async function invokeContinue(options: ContinueInvocationOptions): Promise<ContinueInvocationResponse> {
  const args = buildArgs(options);
  const start = Date.now();

  const child = spawn("cn", args, {
    cwd: options.workingDirectory ?? process.cwd(),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: true
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

  // Continue doesn't use stdin for prompts
  child.stdin.end();

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
