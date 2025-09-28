import { spawn } from "node:child_process";
import { once } from "node:events";

export interface GeminiInvocationOptions {
  prompt: string;
  agentSystemPrompt?: string;
  timeoutMs?: number;
  workingDirectory?: string;
  includeRawEvents?: boolean;
}

export interface GeminiInvocationResponse {
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  response: string;
  stats?: any;
}

export class GeminiInvocationError extends Error {
  public readonly stdout: string;
  public readonly stderr: string;
  public readonly exitCode: number;

  constructor(message: string, exitCode: number, stdout: string, stderr: string) {
    super(message);
    this.name = "GeminiInvocationError";
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

function buildArgs(options: GeminiInvocationOptions): string[] {
  const args: string[] = [];

  // Build full prompt with proper hierarchy
  const fullPrompt = META_INSTRUCTION +
    (options.agentSystemPrompt ? options.agentSystemPrompt + "\n\nUser request:\n" : "") +
    options.prompt;
  args.push(fullPrompt);

  // Add output format for structured response
  args.push("--output-format", "json");

  // Add YOLO mode for automatic approval of all actions
  args.push("-y");  // or "--yolo"

  // Note: model parameter removed as it's not reliably supported

  return args;
}

function parseGeminiResponse(stdout: string): { response: string; stats?: any } {
  // Try to parse the entire stdout as JSON first (for multi-line JSON)
  try {
    const parsed = JSON.parse(stdout);
    if (parsed.response !== undefined) {
      return {
        response: parsed.response || "",
        stats: parsed.stats
      };
    }
  } catch (e) {
    // Not a valid JSON, try line by line
  }

  // Find JSON block that might span multiple lines
  const jsonStart = stdout.indexOf('{');
  const jsonEnd = stdout.lastIndexOf('}');

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    try {
      const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      if (parsed.response !== undefined) {
        return {
          response: parsed.response || "",
          stats: parsed.stats
        };
      }
    } catch (e) {
      // Continue to fallback
    }
  }

  // Fallback: return the entire stdout if no JSON found
  return {
    response: stdout.trim()
  };
}

export async function invokeGemini(options: GeminiInvocationOptions): Promise<GeminiInvocationResponse> {
  const args = buildArgs(options);
  const start = Date.now();

  const child = spawn("gemini", args, {
    cwd: options.workingDirectory ?? process.cwd(),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

  // Gemini doesn't use stdin for prompts
  child.stdin.end();

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new GeminiInvocationError(
        `Gemini invocation timed out after ${timeoutMs}ms`,
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
    throw new GeminiInvocationError(
      `Gemini exited with code ${exitCode}`,
      exitCode,
      stdout,
      stderr
    );
  }

  const parsed = parseGeminiResponse(stdout);

  return {
    exitCode,
    durationMs,
    stdout,
    stderr,
    response: parsed.response,
    stats: parsed.stats
  };
}