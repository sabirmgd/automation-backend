#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const crypto = require('crypto');

// Parse command line arguments
const args = process.argv.slice(2);
const initialMessage = args[0];
const targetDirectory = args[1] || process.cwd();
const sessionId = args[2] || crypto.randomUUID();

if (!initialMessage || !targetDirectory) {
  console.error('Usage: node start-happy-interactive-v2.js "Your message" "/path/to/folder" [session-id]');
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

// Prepare Happy arguments - DON'T use --print flag to keep it interactive
const happyArgs = [
  '--yolo', // Skip permissions
  '--session-id', sessionId,
  // Don't use --print flag as it makes Happy non-interactive
];

console.log(`Starting Happy with session ID: ${sessionId}`);

// Spawn Happy process with proper stdio configuration for interactive mode
const happy = spawn('node', [happyPath, ...happyArgs], {
  stdio: 'pipe', // Use pipe for all to control I/O
  env: {
    ...process.env,
    TERM: process.env.TERM || 'xterm-256color',
    FORCE_COLOR: '1',
  },
  cwd: targetDirectory
});

// Handle Happy stdout
happy.stdout.on('data', (data) => {
  process.stdout.write(data);
});

// Handle Happy stderr
happy.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Create readline interface for input handling
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Flag to track if initial message has been sent
let initialMessageSent = false;

// Send initial message after Happy is ready
const sendInitialMessage = () => {
  if (!initialMessageSent) {
    console.log(`Sending initial message...`);
    happy.stdin.write(initialMessage + '\n');
    initialMessageSent = true;
  }
};

// Wait for Happy to be ready, then send initial message
setTimeout(sendInitialMessage, 5000);

// Handle input from parent process and forward to Happy
rl.on('line', (input) => {
  if (!initialMessageSent) {
    sendInitialMessage();
  }
  happy.stdin.write(input + '\n');
});

// Handle Happy exit
happy.on('exit', (code) => {
  console.log(`Happy exited with code ${code}`);
  rl.close();
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
  rl.close();
});

// Keep process alive
process.stdin.resume();