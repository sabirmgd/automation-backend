#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

// Parse command line arguments
const args = process.argv.slice(2);
const initialMessage = args[0];
const targetDirectory = args[1] || process.cwd();
const sessionId = args[2] || crypto.randomUUID();

if (!initialMessage || !targetDirectory) {
  console.error('Usage: node start-happy-persistent.js "Your message" "/path/to/folder" [session-id]');
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

// Prepare Happy arguments - don't use --print
const happyArgs = [
  '--yolo', // Skip permissions
  '--session-id', sessionId
];

console.log(`Starting Happy with session ID: ${sessionId}`);
console.log(`Session directory: ${sessionDir}`);

// Create a persistent wrapper script
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

// Create output stream
const outputStream = fs.createWriteStream(outputFile, { flags: 'a' });

// Start Happy with pseudo-terminal using unbuffer or script
// This makes Happy think it's running interactively
const isLinux = process.platform === 'linux';
const isMac = process.platform === 'darwin';

let happy;
if (isMac) {
  // On macOS, use script command to create pseudo-TTY
  happy = spawn('script', [
    '-q',
    '/dev/null',
    process.execPath,
    happyPath,
    ...happyArgs
  ], {
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      FORCE_COLOR: '1',
      NODE_NO_READLINE: '1'
    },
    cwd: '${targetDirectory}'
  });
} else {
  // Fallback for other systems
  happy = spawn('node', [happyPath, ...happyArgs], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      FORCE_COLOR: '1'
    },
    cwd: '${targetDirectory}'
  });
}

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
happy.stdout.on('data', (data) => {
  const text = data.toString();
  console.log(text);
  outputStream.write(text);
});

happy.stderr.on('data', (data) => {
  const text = data.toString();
  console.error(text);
  outputStream.write('[STDERR] ' + text);
});

// Send initial message after Happy starts
setTimeout(() => {
  console.log('Sending initial context message to Happy...');
  console.log('Context length: ' + initialMessage.length + ' characters');

  // Send the message in chunks to avoid buffer overflow
  const chunks = [];
  const chunkSize = 1024;
  for (let i = 0; i < initialMessage.length; i += chunkSize) {
    chunks.push(initialMessage.slice(i, i + chunkSize));
  }

  let chunkIndex = 0;
  const sendChunk = () => {
    if (chunkIndex < chunks.length) {
      happy.stdin.write(chunks[chunkIndex]);
      chunkIndex++;
      setTimeout(sendChunk, 10);
    } else {
      // Send newline to submit the message
      happy.stdin.write('\\n');
      console.log('Initial context sent successfully');

      // Keep stdin open
      happy.stdin.write('\\n');
    }
  };

  sendChunk();
}, 5000); // Give Happy 5 seconds to fully initialize

// Watch input file for additional messages
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
        console.log('Received new input: ' + newInput.substring(0, 50) + '...');
        happy.stdin.write(newInput);
        if (!newInput.endsWith('\\n')) {
          happy.stdin.write('\\n');
        }
      }
      lastSize = curr.size;
    }
  });
};

// Start watching for input after initial message is sent
setTimeout(watchInput, 7000);

// Keep Happy alive by sending periodic newlines
setInterval(() => {
  if (!happy.killed) {
    // Send empty line to keep session active
    happy.stdin.write('\\n');
  }
}, 30000); // Every 30 seconds

// Handle Happy exit
happy.on('exit', (code) => {
  console.log(\`Happy exited with code \${code}\`);
  fs.writeFileSync(statusFile, JSON.stringify({
    status: 'exited',
    exitCode: code,
    exitedAt: new Date().toISOString()
  }));
  process.exit(code || 0);
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
  console.log('Received SIGTERM, shutting down Happy...');
  happy.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down Happy...');
  happy.kill('SIGINT');
});

console.log('Happy wrapper started, waiting for initialization...');
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