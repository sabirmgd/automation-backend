#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Parse command line arguments
const args = process.argv.slice(2);
const initialMessage = args[0];
const targetDirectory = args[1] || process.cwd();
const sessionId = args[2] || crypto.randomUUID();

if (!initialMessage || !targetDirectory) {
  console.error('Usage: node start-happy-detached.js "Your message" "/path/to/folder" [session-id]');
  process.exit(1);
}

// Create session directory for IPC
const sessionDir = path.join(require('os').tmpdir(), 'happy-sessions', sessionId);
fs.mkdirSync(sessionDir, { recursive: true });

// Create files for IPC
const inputFile = path.join(sessionDir, 'input.txt');
const outputFile = path.join(sessionDir, 'output.log');
const pidFile = path.join(sessionDir, 'process.pid');
const statusFile = path.join(sessionDir, 'status.json');

// Initialize files
fs.writeFileSync(inputFile, '');
fs.writeFileSync(outputFile, '');
fs.writeFileSync(statusFile, JSON.stringify({
  status: 'starting',
  sessionId: sessionId,
  directory: targetDirectory,
  startedAt: new Date().toISOString()
}));

// Change to target directory
try {
  process.chdir(targetDirectory);
  console.log(`Changed to directory: ${targetDirectory}`);
} catch (error) {
  console.error(`Error changing directory: ${error.message}`);
  fs.writeFileSync(statusFile, JSON.stringify({
    status: 'failed',
    error: error.message
  }));
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
console.log(`Session directory: ${sessionDir}`);

// Create a wrapper script that will keep Happy alive
const wrapperScript = `
const { spawn } = require('child_process');
const fs = require('fs');
const readline = require('readline');

const happyPath = '${happyPath}';
const happyArgs = ${JSON.stringify(happyArgs)};
const inputFile = '${inputFile}';
const outputFile = '${outputFile}';
const statusFile = '${statusFile}';
const initialMessage = ${JSON.stringify(initialMessage)};

// Start Happy
const happy = spawn('node', [happyPath, ...happyArgs], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    TERM: 'xterm-256color',
    FORCE_COLOR: '1'
  },
  cwd: '${targetDirectory}'
});

// Write PID
fs.writeFileSync('${pidFile}', happy.pid.toString());

// Update status
fs.writeFileSync(statusFile, JSON.stringify({
  status: 'running',
  pid: happy.pid,
  sessionId: '${sessionId}',
  directory: '${targetDirectory}',
  startedAt: new Date().toISOString()
}));

// Handle output
const outputStream = fs.createWriteStream(outputFile, { flags: 'a' });
happy.stdout.pipe(outputStream);
happy.stderr.pipe(outputStream);

happy.stdout.on('data', (data) => {
  console.log(data.toString());
});

happy.stderr.on('data', (data) => {
  console.error(data.toString());
});

// Send initial message after delay
setTimeout(() => {
  console.log('Sending initial message...');
  happy.stdin.write(initialMessage + '\\n');
}, 3000);

// Watch input file for new messages
let lastSize = 0;
const watchInput = () => {
  fs.watchFile(inputFile, { interval: 100 }, (curr, prev) => {
    if (curr.size > lastSize) {
      // Read new content
      const buffer = Buffer.alloc(curr.size - lastSize);
      const fd = fs.openSync(inputFile, 'r');
      fs.readSync(fd, buffer, 0, buffer.length, lastSize);
      fs.closeSync(fd);

      const newInput = buffer.toString();
      if (newInput.trim()) {
        happy.stdin.write(newInput);
        if (!newInput.endsWith('\\n')) {
          happy.stdin.write('\\n');
        }
      }
      lastSize = curr.size;
    }
  });
};

// Start watching for input
setTimeout(watchInput, 5000);

// Keep process alive
setInterval(() => {
  // Heartbeat - check if Happy is still responsive
  if (happy.killed) {
    fs.writeFileSync(statusFile, JSON.stringify({
      status: 'stopped',
      exitCode: happy.exitCode,
      stoppedAt: new Date().toISOString()
    }));
    process.exit(0);
  }
}, 1000);

// Handle Happy exit
happy.on('exit', (code) => {
  console.log(\`Happy exited with code \${code}\`);
  fs.writeFileSync(statusFile, JSON.stringify({
    status: 'exited',
    exitCode: code,
    exitedAt: new Date().toISOString()
  }));
  process.exit(code);
});

// Handle errors
happy.on('error', (error) => {
  console.error(\`Error: \${error.message}\`);
  fs.writeFileSync(statusFile, JSON.stringify({
    status: 'error',
    error: error.message,
    errorAt: new Date().toISOString()
  }));
  process.exit(1);
});

// Handle signals
process.on('SIGTERM', () => {
  happy.kill('SIGTERM');
});
process.on('SIGINT', () => {
  happy.kill('SIGINT');
});
`;

// Write wrapper script to temp file
const wrapperPath = path.join(sessionDir, 'wrapper.js');
fs.writeFileSync(wrapperPath, wrapperScript);

// Spawn the wrapper as a detached process
const wrapper = spawn('node', [wrapperPath], {
  detached: true,
  stdio: ['ignore',
         fs.openSync(path.join(sessionDir, 'wrapper.out'), 'a'),
         fs.openSync(path.join(sessionDir, 'wrapper.err'), 'a')],
  env: process.env
});

// Let the parent process exit while child continues running
wrapper.unref();

console.log(`Happy session started in background`);
console.log(`Wrapper PID: ${wrapper.pid}`);
console.log(`Session files:`);
console.log(`  Input: ${inputFile}`);
console.log(`  Output: ${outputFile}`);
console.log(`  Status: ${statusFile}`);
console.log(`  PID: ${pidFile}`);

// Return session info
const sessionInfo = {
  sessionId,
  wrapperPid: wrapper.pid,
  sessionDir,
  inputFile,
  outputFile,
  statusFile,
  pidFile
};

console.log('\nSession Info:');
console.log(JSON.stringify(sessionInfo, null, 2));

// Exit parent process
process.exit(0);