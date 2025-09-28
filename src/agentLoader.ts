import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

export interface Agent {
  name: string;
  description: string;
  category?: string;
  systemPrompt: string;
}

const AGENTS_DIR = join(homedir(), '.superagent', 'agents');

// Get package agents directory (works for both local and npx)
function getPackageAgentsDir(): string | null {
  try {
    // Try to find the agents directory relative to this module
    const currentDir = dirname(fileURLToPath(import.meta.url));

    // Look for agents directory in parent (for dist/agentLoader.js)
    const parentAgentsDir = join(dirname(currentDir), 'agents');
    if (existsSync(parentAgentsDir)) {
      return parentAgentsDir;
    }

    // Look in current directory (fallback)
    const localAgentsDir = join(currentDir, 'agents');
    if (existsSync(localAgentsDir)) {
      return localAgentsDir;
    }

    return null;
  } catch (error) {
    console.error('Error finding package agents directory:', error);
    return null;
  }
}

// Copy agents from package to user directory if needed
function copyAgentsIfNeeded(): void {
  const packageAgentsDir = getPackageAgentsDir();
  if (!packageAgentsDir) {
    return;
  }

  try {
    const packageAgents = readdirSync(packageAgentsDir).filter(f => f.endsWith('.md'));
    let copiedCount = 0;

    for (const agentFile of packageAgents) {
      const targetPath = join(AGENTS_DIR, agentFile);
      if (!existsSync(targetPath)) {
        const sourcePath = join(packageAgentsDir, agentFile);
        copyFileSync(sourcePath, targetPath);
        copiedCount++;
      }
    }

    if (copiedCount > 0) {
      console.error(`Copied ${copiedCount} agent(s) to ~/.superagent/agents`);
    }
  } catch (error) {
    console.error('Error copying agents:', error);
  }
}

// Ensure agents directory exists and copy agents if needed
export function ensureAgentsDirectory(): void {
  if (!existsSync(AGENTS_DIR)) {
    mkdirSync(AGENTS_DIR, { recursive: true });
  }

  // Copy agents from package if they don't exist
  copyAgentsIfNeeded();
}

// Parse agent from markdown content
function parseAgentFile(content: string): Agent | null {
  try {
    // Look for frontmatter (--- ... ---)
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const body = frontmatterMatch[2].trim();

    // Parse frontmatter fields
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m);
    const categoryMatch = frontmatter.match(/^category:\s*(.+)$/m);

    if (!nameMatch || !descriptionMatch) {
      return null;
    }

    return {
      name: nameMatch[1].trim(),
      description: descriptionMatch[1].trim(),
      category: categoryMatch ? categoryMatch[1].trim() : undefined,
      systemPrompt: body
    };
  } catch (error) {
    console.error('Error parsing agent file:', error);
    return null;
  }
}

// Load all agents from the agents directory
export function loadAgents(): Agent[] {
  ensureAgentsDirectory();

  try {
    const files = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
    const agents: Agent[] = [];

    for (const file of files) {
      const content = readFileSync(join(AGENTS_DIR, file), 'utf-8');
      const agent = parseAgentFile(content);
      if (agent) {
        agents.push(agent);
      } else {
        console.warn(`Failed to parse agent file: ${file}`);
      }
    }

    return agents;
  } catch (error) {
    console.error('Error loading agents:', error);
    return [];
  }
}

// Get a specific agent by name
export function getAgent(name: string): Agent | undefined {
  const agents = loadAgents();
  return agents.find(a => a.name === name);
}

// Format agents for tool description
export function formatAgentsForDescription(): string {
  const agents = loadAgents();

  if (agents.length === 0) {
    return '';
  }

  const agentList = agents
    .map(a => `- ${a.name}: ${a.description}`)
    .join('\n');

  return `\n\nAvailable specialized agents:\n${agentList}\n\nUse the 'agent' parameter to invoke a specific agent.`;
}