#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

// Parse command line arguments
const args = process.argv.slice(2);
const initialMessage = args[0];
const targetDirectory = args[1] || process.cwd();
const sessionId = args[2] || crypto.randomUUID();

if (!initialMessage || !targetDirectory) {
  console.error('Usage: node start-claude-interactive.js "Your message" "/path/to/folder" [session-id]');
  process.exit(1);
}

// Change to target directory
try {
  process.chdir(targetDirectory);
  console.log(`Changed to directory: ${targetDirectory}`);
} catch (error) {
  console.error(`Error changing directory: ${error.message}`);
  process.exit(1);
}

// Find the Claude CLI path
const claudePath = require('which').sync('claude');
console.log(`Found Claude at: ${claudePath}`);

// Prepare Claude arguments
const claudeArgs = [
  '--dangerously-skip-permissions', // or --yolo
  '--session-id', sessionId
];

console.log(`Starting Claude with session ID: ${sessionId}`);

// Spawn Claude process
const claude = spawn('node', [claudePath, ...claudeArgs], {
  stdio: ['pipe', 'inherit', 'inherit'],
  env: {
    ...process.env,
    // Add any additional environment variables here
  },
  cwd: targetDirectory
});

// Send initial message after a delay to ensure Claude is ready
setTimeout(() => {
  console.log(`Sending initial message...`);
  claude.stdin.write(initialMessage + '\n');

  // After sending the initial message, connect stdin to Claude
  process.stdin.pipe(claude.stdin);
}, 2000);

// Handle Claude exit
claude.on('exit', (code) => {
  console.log(`Claude exited with code ${code}`);
  process.exit(code);
});

// Handle errors
claude.on('error', (error) => {
  console.error(`Error spawning Claude: ${error.message}`);
  process.exit(1);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  claude.kill('SIGINT');
});