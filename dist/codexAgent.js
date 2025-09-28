import { spawn } from "node:child_process";
import { once } from "node:events";
export class CodexInvocationError extends Error {
    stdout;
    stderr;
    exitCode;
    constructor(message, exitCode, stdout, stderr) {
        super(message);
        this.name = "CodexInvocationError";
        this.exitCode = exitCode;
        this.stdout = stdout;
        this.stderr = stderr;
    }
}
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
function buildArgs(options) {
    const args = [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox" // Full permissions - no restrictions
    ];
    // Note: model parameter removed as it's not reliably supported
    if (options.extraArgs && options.extraArgs.length > 0) {
        args.push(...options.extraArgs);
    }
    args.push("-");
    return args;
}
function collectFromMsg(msg, replies) {
    const type = msg["type"];
    if (type === "agent_message") {
        const message = msg["message"];
        if (typeof message === "string" && message.trim().length > 0) {
            replies.push(message.trim());
        }
        const content = msg["content"];
        if (Array.isArray(content)) {
            for (const chunk of content) {
                if (chunk && typeof chunk === "object" && "text" in chunk) {
                    const text = chunk.text;
                    if (typeof text === "string" && text.trim().length > 0) {
                        replies.push(text.trim());
                    }
                }
            }
        }
    }
    if (type === "assistant_message") {
        const content = msg["content"];
        if (Array.isArray(content)) {
            for (const chunk of content) {
                if (chunk && typeof chunk === "object" && "text" in chunk) {
                    const text = chunk.text;
                    if (typeof text === "string" && text.trim().length > 0) {
                        replies.push(text.trim());
                    }
                }
            }
        }
    }
}
function parseAssistantReply(events) {
    const replies = [];
    for (const event of events) {
        if (!event || typeof event !== "object") {
            continue;
        }
        if ("msg" in event && event.msg && typeof event.msg === "object") {
            collectFromMsg(event.msg, replies);
            continue;
        }
        if (event["type"] === "message") {
            const data = event["data"];
            if (!data || data["role"] !== "assistant") {
                continue;
            }
            const content = data["content"];
            if (Array.isArray(content)) {
                for (const chunk of content) {
                    if (chunk && typeof chunk === "object" && "text" in chunk) {
                        const text = chunk.text;
                        if (typeof text === "string" && text.length > 0) {
                            replies.push(text);
                        }
                    }
                }
            }
        }
    }
    return replies.join("\n").trim();
}
function parseJsonLines(stdout) {
    const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const events = [];
    for (const line of lines) {
        try {
            const parsed = JSON.parse(line);
            events.push(parsed);
        }
        catch {
            events.push({ type: "log", data: line });
        }
    }
    return events;
}
const META_INSTRUCTION = `You are an MCP-invoked agent. Your responses should be:
- Concise but complete
- Focus on the requested task
- Do what has been asked, nothing more, nothing less

You are a general-purpose agent capable of:
- Code analysis and modification
- Documentation tasks
- Multi-step research
- System exploration

User request:
`;
export async function invokeCodex(options) {
    const args = buildArgs(options);
    const start = Date.now();
    const child = spawn("codex", args, {
        cwd: options.workingDirectory ?? process.cwd(),
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"]
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    // Add meta instruction before user prompt
    const fullPrompt = META_INSTRUCTION + options.prompt;
    child.stdin.write(fullPrompt);
    child.stdin.end();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new CodexInvocationError(`Codex invocation timed out after ${timeoutMs}ms`, -1, Buffer.concat(stdoutChunks).toString("utf8"), Buffer.concat(stderrChunks).toString("utf8")));
        }, timeoutMs);
    });
    let closeResult;
    try {
        closeResult = (await Promise.race([once(child, "close"), timeoutPromise]));
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
    const durationMs = Date.now() - start;
    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    const stderr = Buffer.concat(stderrChunks).toString("utf8");
    const exitCode = closeResult[0] ?? 0;
    if (exitCode !== 0) {
        throw new CodexInvocationError(`Codex exited with code ${exitCode}`, exitCode, stdout, stderr);
    }
    const events = parseJsonLines(stdout);
    const assistantReply = parseAssistantReply(events);
    return {
        exitCode,
        durationMs,
        stdout,
        stderr,
        parsedEvents: events,
        assistantReply
    };
}
