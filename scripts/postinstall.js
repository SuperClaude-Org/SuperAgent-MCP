#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const sourceAgentsDir = join(__dirname, '..', 'agents');
const targetAgentsDir = join(homedir(), '.superagent', 'agents');

function copyAgents() {
  try {
    // Create target directory if it doesn't exist
    if (!existsSync(targetAgentsDir)) {
      mkdirSync(targetAgentsDir, { recursive: true });
      console.log(`Created agents directory: ${targetAgentsDir}`);
    }

    // Get all .md files from source directory
    const agentFiles = readdirSync(sourceAgentsDir).filter(f => f.endsWith('.md'));

    if (agentFiles.length === 0) {
      console.log('No agent files found to copy');
      return;
    }

    // Copy each agent file
    let copiedCount = 0;
    for (const file of agentFiles) {
      const sourceFile = join(sourceAgentsDir, file);
      const targetFile = join(targetAgentsDir, file);

      // Only copy if file doesn't exist (don't overwrite user customizations)
      if (!existsSync(targetFile)) {
        copyFileSync(sourceFile, targetFile);
        copiedCount++;
        console.log(`Copied agent: ${file}`);
      } else {
        console.log(`Skipped existing agent: ${file}`);
      }
    }

    console.log(`\n✓ SuperAgent setup complete!`);
    console.log(`  ${copiedCount} new agents installed to ${targetAgentsDir}`);
    console.log(`  ${agentFiles.length - copiedCount} agents already existed (preserved)`);

  } catch (error) {
    console.error('Error copying agent files:', error);
    // Don't fail the installation if copying agents fails
    process.exit(0);
  }
}

// Run the copy operation
copyAgents();