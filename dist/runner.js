import { invokeCodex, CodexInvocationError } from "./codexAgent.js";
import { invokeGemini, GeminiInvocationError } from "./geminiAgent.js";
async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    let activeCount = 0;
    return new Promise((resolve, reject) => {
        const launchNext = () => {
            if (nextIndex >= items.length && activeCount === 0) {
                resolve(results);
                return;
            }
            while (activeCount < limit && nextIndex < items.length) {
                const currentIndex = nextIndex++;
                activeCount += 1;
                worker(items[currentIndex], currentIndex)
                    .then((value) => {
                    results[currentIndex] = value;
                })
                    .catch((error) => {
                    reject(error);
                })
                    .finally(() => {
                    activeCount -= 1;
                    launchNext();
                });
            }
        };
        launchNext();
    });
}
// Function for Codex batch processing
export async function runCodexBatch(input) {
    const concurrency = Math.min(input.concurrency ?? input.prompts.length, input.prompts.length);
    return runWithConcurrency(input.prompts, concurrency, async (prompt) => {
        try {
            const result = await invokeCodex({
                prompt: prompt.prompt,
                extraArgs: prompt.extraArgs,
                timeoutMs: prompt.timeoutMs,
                workingDirectory: prompt.workingDirectory
            });
            return {
                status: "ok",
                task: prompt.task,
                prompt: prompt.prompt,
                agent: "codex",
                response: result.assistantReply || result.stdout,
                exitCode: result.exitCode,
                durationMs: result.durationMs,
                rawEvents: undefined,
                rawOutput: undefined,
                stderr: undefined
            };
        }
        catch (error) {
            if (error instanceof CodexInvocationError) {
                return {
                    status: "error",
                    task: prompt.task,
                    prompt: prompt.prompt,
                    agent: "codex",
                    error: error.message,
                    exitCode: error.exitCode,
                    rawOutput: error.stdout,
                    stderr: error.stderr
                };
            }
            return {
                status: "error",
                task: prompt.task,
                prompt: prompt.prompt,
                agent: "codex",
                error: error instanceof Error ? error.message : String(error)
            };
        }
    });
}
// Function for Gemini batch processing
export async function runGeminiBatch(input) {
    const concurrency = Math.min(input.concurrency ?? input.prompts.length, input.prompts.length);
    return runWithConcurrency(input.prompts, concurrency, async (prompt) => {
        try {
            const result = await invokeGemini({
                prompt: prompt.prompt,
                timeoutMs: prompt.timeoutMs,
                workingDirectory: prompt.workingDirectory
            });
            return {
                status: "ok",
                task: prompt.task,
                prompt: prompt.prompt,
                agent: "gemini",
                response: result.response,
                exitCode: result.exitCode,
                durationMs: result.durationMs,
                rawEvents: undefined,
                rawOutput: undefined,
                stderr: undefined
            };
        }
        catch (error) {
            if (error instanceof GeminiInvocationError) {
                return {
                    status: "error",
                    task: prompt.task,
                    prompt: prompt.prompt,
                    agent: "gemini",
                    error: error.message,
                    exitCode: error.exitCode,
                    rawOutput: error.stdout,
                    stderr: error.stderr
                };
            }
            return {
                status: "error",
                task: prompt.task,
                prompt: prompt.prompt,
                agent: "gemini",
                error: error instanceof Error ? error.message : String(error)
            };
        }
    });
}
// Keep backward compatibility function
function resolveAgent(prompt, agentEnv) {
    if (agentEnv === "gemini") {
        return {
            agentName: "gemini",
            run: () => invokeGemini({
                prompt: prompt.prompt,
                timeoutMs: prompt.timeoutMs,
                workingDirectory: prompt.workingDirectory
            })
        };
    }
    else if (agentEnv === "codex") {
        return {
            agentName: "codex",
            run: () => invokeCodex({
                prompt: prompt.prompt,
                extraArgs: prompt.extraArgs,
                timeoutMs: prompt.timeoutMs,
                workingDirectory: prompt.workingDirectory
            })
        };
    }
    else {
        throw new Error(`Unsupported agent environment: ${agentEnv}`);
    }
}
// Keep backward compatibility with original runBatch
export async function runBatch(input) {
    const concurrency = Math.min(input.concurrency ?? input.prompts.length, input.prompts.length);
    return runWithConcurrency(input.prompts, concurrency, async (prompt) => {
        const agent = resolveAgent(prompt, input.agentEnv);
        try {
            const result = await agent.run(); // Type workaround for different response types
            // Handle different response types
            const response = result.response || result.assistantReply || result.stdout;
            const rawEvents = input.includeRawEvents ?
                (result.stats || result.parsedEvents) : undefined;
            return {
                status: "ok",
                task: prompt.task,
                prompt: prompt.prompt,
                agent: agent.agentName,
                response: response,
                exitCode: result.exitCode,
                durationMs: result.durationMs,
                rawEvents: rawEvents,
                rawOutput: input.includeRawEvents ? result.stdout : undefined,
                stderr: input.includeRawEvents ? result.stderr : undefined
            };
        }
        catch (error) {
            const isCodexError = error instanceof CodexInvocationError;
            const isGeminiError = error instanceof GeminiInvocationError;
            if (isCodexError || isGeminiError) {
                const invocationError = error;
                return {
                    status: "error",
                    task: prompt.task,
                    prompt: prompt.prompt,
                    agent: agent.agentName,
                    error: invocationError.message,
                    exitCode: invocationError.exitCode,
                    rawOutput: invocationError.stdout,
                    stderr: invocationError.stderr
                };
            }
            return {
                status: "error",
                task: prompt.task,
                prompt: prompt.prompt,
                agent: agent.agentName,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    });
}
