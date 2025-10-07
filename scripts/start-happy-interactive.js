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
  console.error('Usage: node start-happy-interactive.js "Your message" "/path/to/folder" [session-id]');
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

// Find the Happy CLI path
const happyPath = require('which').sync('happy');
console.log(`Found Happy at: ${happyPath}`);

// Prepare Happy arguments
const happyArgs = [
  '--yolo', // Skip permissions
  '--session-id', sessionId
];

console.log(`Starting Happy with session ID: ${sessionId}`);

// Spawn Happy process
const happy = spawn('node', [happyPath, ...happyArgs], {
  stdio: ['pipe', 'inherit', 'inherit'],
  env: {
    ...process.env,
    TERM: process.env.TERM || 'xterm-256color',
    // Add any additional environment variables here
  },
  cwd: targetDirectory
});

// Send initial message after a delay to ensure Happy is ready
setTimeout(() => {
  console.log(`Sending initial message...`);
  happy.stdin.write(initialMessage + '\n');

  // After sending the initial message, connect stdin to Happy
  // Keep stdin open and in raw mode if it's a TTY
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.pipe(happy.stdin);

  // Keep the parent process alive and listening
  process.stdin.resume();
}, 3000); // Slightly longer delay for Happy

// Handle Happy exit
happy.on('exit', (code) => {
  console.log(`Happy exited with code ${code}`);
  process.exit(code);
});

// Handle errors
happy.on('error', (error) => {
  console.error(`Error spawning Happy: ${error.message}`);
  process.exit(1);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  happy.kill('SIGINT');
});