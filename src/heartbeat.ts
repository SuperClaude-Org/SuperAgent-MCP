import { HeartbeatOptions, HeartbeatController } from "./types.js";

/**
 * Creates a heartbeat controller that sends progress notifications every N seconds
 * to prevent MCP client timeout (typically 60 seconds).
 *
 * @param options Heartbeat configuration
 * @returns Controller with start() and stop() methods
 */
export function createHeartbeat(options: HeartbeatOptions): HeartbeatController {
  const {
    intervalMs = 30000,  // Default 30 seconds
    progressToken,
    server
  } = options;

  let intervalHandle: NodeJS.Timeout | null = null;
  let counter = 1;

  const start = () => {
    // Only start heartbeat if progressToken is provided
    if (!progressToken) {
      return;
    }

    intervalHandle = setInterval(async () => {
      try {
        await server.notification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: counter,
            total: undefined,  // Unknown total for long-running operations
          }
        });
        counter++;
      } catch (error) {
        console.error("Failed to send heartbeat notification:", error);
      }
    }, intervalMs);
  };

  const stop = () => {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  };

  return { start, stop };
}
