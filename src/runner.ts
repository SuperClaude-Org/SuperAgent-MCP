import { BatchInvokeInput, AgentInvocationResult, AgentPromptInput } from "./types.js";
import { invokeCodex, CodexInvocationError } from "./codexAgent.js";
import { invokeGemini, GeminiInvocationError } from "./geminiAgent.js";
import { invokeContinue, ContinueInvocationError } from "./continueAgent.js";
import { getAgent } from "./agentLoader.js";
import { z } from "zod";

// Type for the base schema without agentEnv
type BaseInvokeInput = z.infer<typeof import("./types.js").CodexInvokeSchema>;

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
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
export async function runCodexBatch(input: BaseInvokeInput): Promise<AgentInvocationResult[]> {
  const concurrency = Math.min(input.concurrency ?? input.inputs.length, input.inputs.length);

  return runWithConcurrency(input.inputs, concurrency, async (prompt) => {
    try {
      // Load agent system prompt if specified
      let agentSystemPrompt: string | undefined;
      if (prompt.agent) {
        const agent = getAgent(prompt.agent);
        if (agent) {
          agentSystemPrompt = agent.systemPrompt;
        }
      }

      const result = await invokeCodex({
        prompt: prompt.prompt,
        agentSystemPrompt,
        extraArgs: prompt.extraArgs,
        timeoutMs: prompt.timeoutMs,
        workingDirectory: prompt.workingDirectory
      });
      return {
        status: "ok",
        agent: prompt.agent,
        prompt: prompt.prompt,
        tool: "codex",
        response: result.assistantReply || result.stdout,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        rawEvents: undefined,
        rawOutput: undefined,
        stderr: undefined
      } satisfies AgentInvocationResult;
    } catch (error) {
      if (error instanceof CodexInvocationError) {
        return {
          status: "error",
          agent: prompt.agent,
          prompt: prompt.prompt,
          tool: "codex",
          error: error.message,
          exitCode: error.exitCode,
          rawOutput: error.stdout,
          stderr: error.stderr
        } satisfies AgentInvocationResult;
      }

      return {
        status: "error",
        agent: prompt.agent,
        prompt: prompt.prompt,
        tool: "codex",
        error: error instanceof Error ? error.message : String(error)
      } satisfies AgentInvocationResult;
    }
  });
}

// Function for Gemini batch processing
export async function runGeminiBatch(input: BaseInvokeInput): Promise<AgentInvocationResult[]> {
  const concurrency = Math.min(input.concurrency ?? input.inputs.length, input.inputs.length);

  return runWithConcurrency(input.inputs, concurrency, async (prompt) => {
    try {
      // Load agent system prompt if specified
      let agentSystemPrompt: string | undefined;
      if (prompt.agent) {
        const agent = getAgent(prompt.agent);
        if (agent) {
          agentSystemPrompt = agent.systemPrompt;
        }
      }

      const result = await invokeGemini({
        prompt: prompt.prompt,
        agentSystemPrompt,
        timeoutMs: prompt.timeoutMs,
        workingDirectory: prompt.workingDirectory
      });
      return {
        status: "ok",
        agent: prompt.agent,
        prompt: prompt.prompt,
        tool: "gemini",
        response: result.response,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        rawEvents: undefined,
        rawOutput: undefined,
        stderr: undefined
      } satisfies AgentInvocationResult;
    } catch (error) {
      if (error instanceof GeminiInvocationError) {
        return {
          status: "error",
          agent: prompt.agent,
          prompt: prompt.prompt,
          tool: "gemini",
          error: error.message,
          exitCode: error.exitCode,
          rawOutput: error.stdout,
          stderr: error.stderr
        } satisfies AgentInvocationResult;
      }

      return {
        status: "error",
        agent: prompt.agent,
        prompt: prompt.prompt,
        tool: "gemini",
        error: error instanceof Error ? error.message : String(error)
      } satisfies AgentInvocationResult;
    }
  });
}

// Function for Continue batch processing
export async function runContinueBatch(input: BaseInvokeInput): Promise<AgentInvocationResult[]> {
  const concurrency = Math.min(input.concurrency ?? input.inputs.length, input.inputs.length);

  return runWithConcurrency(input.inputs, concurrency, async (prompt) => {
    try {
      // Load agent system prompt if specified
      let agentSystemPrompt: string | undefined;
      if (prompt.agent) {
        const agent = getAgent(prompt.agent);
        if (agent) {
          agentSystemPrompt = agent.systemPrompt;
        }
      }

      const result = await invokeContinue({
        prompt: prompt.prompt,
        agentSystemPrompt,
        timeoutMs: prompt.timeoutMs,
        workingDirectory: prompt.workingDirectory
      });
      return {
        status: "ok",
        agent: prompt.agent,
        prompt: prompt.prompt,
        tool: "continue",
        response: result.response,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        rawEvents: undefined,
        rawOutput: undefined,
        stderr: undefined
      } satisfies AgentInvocationResult;
    } catch (error) {
      if (error instanceof ContinueInvocationError) {
        return {
          status: "error",
          agent: prompt.agent,
          prompt: prompt.prompt,
          tool: "continue",
          error: error.message,
          exitCode: error.exitCode,
          rawOutput: error.stdout,
          stderr: error.stderr
        } satisfies AgentInvocationResult;
      }

      return {
        status: "error",
        agent: prompt.agent,
        prompt: prompt.prompt,
        tool: "continue",
        error: error instanceof Error ? error.message : String(error)
      } satisfies AgentInvocationResult;
    }
  });
}

// Keep backward compatibility function
function resolveAgent(prompt: AgentPromptInput, agentEnv: string) {
  if (agentEnv === "gemini") {
    return {
      agentName: "gemini",
      run: () =>
        invokeGemini({
          prompt: prompt.prompt,
          timeoutMs: prompt.timeoutMs,
          workingDirectory: prompt.workingDirectory
        })
    };
  } else if (agentEnv === "codex") {
    return {
      agentName: "codex",
      run: () =>
        invokeCodex({
          prompt: prompt.prompt,
          extraArgs: prompt.extraArgs,
          timeoutMs: prompt.timeoutMs,
          workingDirectory: prompt.workingDirectory
        })
    };
  } else {
    throw new Error(`Unsupported agent environment: ${agentEnv}`);
  }
}

// Keep backward compatibility with original runBatch
export async function runBatch(input: BatchInvokeInput): Promise<AgentInvocationResult[]> {
  const concurrency = Math.min(input.concurrency ?? input.prompts.length, input.prompts.length);

  return runWithConcurrency(input.prompts, concurrency, async (prompt) => {
    const agent = resolveAgent(prompt, input.agentEnv);

    try {
      const result = await agent.run() as any;  // Type workaround for different response types
      // Handle different response types
      const response = result.response || result.assistantReply || result.stdout;
      const rawEvents = input.includeRawEvents ?
                       (result.stats || result.parsedEvents) : undefined;

      return {
        status: "ok",
        agent: prompt.agent,
        prompt: prompt.prompt,
        tool: agent.agentName as "codex" | "gemini",
        response: response,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        rawEvents: rawEvents,
        rawOutput: input.includeRawEvents ? result.stdout : undefined,
        stderr: input.includeRawEvents ? result.stderr : undefined
      } satisfies AgentInvocationResult;
    } catch (error) {
      const isCodexError = error instanceof CodexInvocationError;
      const isGeminiError = error instanceof GeminiInvocationError;

      if (isCodexError || isGeminiError) {
        const invocationError = error as CodexInvocationError | GeminiInvocationError;
        return {
          status: "error",
          agent: prompt.agent,
          prompt: prompt.prompt,
          tool: agent.agentName as "codex" | "gemini",
          error: invocationError.message,
          exitCode: invocationError.exitCode,
          rawOutput: invocationError.stdout,
          stderr: invocationError.stderr
        } satisfies AgentInvocationResult;
      }

      return {
        status: "error",
        agent: prompt.agent,
        prompt: prompt.prompt,
        tool: agent.agentName as "codex" | "gemini",
        error: error instanceof Error ? error.message : String(error)
      } satisfies AgentInvocationResult;
    }
  });
}