import { ChildProcess } from "node:child_process";

// Track all active child processes
const activeProcesses = new Set<ChildProcess>();

/**
 * Register a child process for tracking
 */
export function registerProcess(child: ChildProcess): void {
  activeProcesses.add(child);

  // Auto-remove when process exits
  child.on("close", () => {
    activeProcesses.delete(child);
  });

  child.on("error", () => {
    activeProcesses.delete(child);
  });
}

/**
 * Kill all active child processes
 */
export function killAllProcesses(): void {
  for (const child of activeProcesses) {
    try {
      child.kill("SIGKILL");
    } catch (e) {
      // Process may have already exited
    }
  }
  activeProcesses.clear();
}

/**
 * Get count of active processes
 */
export function getActiveProcessCount(): number {
  return activeProcesses.size;
}

/**
 * Setup signal handlers for graceful shutdown
 */
export function setupSignalHandlers(): void {
  const cleanup = () => {
    killAllProcesses();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Handle stdin close (when parent disconnects)
  process.stdin.on("close", cleanup);
}
