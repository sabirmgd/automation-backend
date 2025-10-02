export function truncateLogs(logs: string, maxLength: number = 10000): string {
  if (logs.length <= maxLength) {
    return logs;
  }

  // Try to keep the most relevant parts: beginning and end
  const headLength = Math.floor(maxLength * 0.3);
  const tailLength = Math.floor(maxLength * 0.7);

  const head = logs.slice(0, headLength);
  const tail = logs.slice(-tailLength);

  return `${head}\n\n... [truncated ${logs.length - maxLength} characters] ...\n\n${tail}`;
}

export function extractErrorPatterns(logs: string): string[] {
  const patterns: string[] = [];
  const lines = logs.split('\n');

  const errorIndicators = [
    /error:/i,
    /failed:/i,
    /fatal:/i,
    /exception:/i,
    /not found/i,
    /permission denied/i,
    /timeout/i,
    /unable to/i,
    /cannot/i,
    /invalid/i,
    /missing/i,
    /undefined/i,
    /null reference/i,
    /exit code \d+/i,
    /non-zero exit/i,
  ];

  for (const line of lines) {
    for (const indicator of errorIndicators) {
      if (indicator.test(line)) {
        // Extract the line and clean it up
        const cleanLine = line
          .replace(/\[\d{4}-\d{2}-\d{2}.*?\]/g, '') // Remove timestamps
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();

        if (cleanLine.length > 10 && cleanLine.length < 200) {
          patterns.push(cleanLine);
        }
        break;
      }
    }
  }

  // Remove duplicates and limit to top 10 patterns
  return [...new Set(patterns)].slice(0, 10);
}

export function extractStackTrace(logs: string): string | null {
  const stackTracePatterns = [
    /traceback \(most recent call last\):[\s\S]*?(?=\n\n|\n[A-Z]|$)/i,
    /at .+?\(.+?:\d+:\d+\)[\s\S]*?(?=\n\n|$)/,
    /\s+at\s+.+?\(.+?\)[\s\S]*?(?=\n\n|$)/,
    /caused by:[\s\S]*?(?=\n\n|$)/i,
  ];

  for (const pattern of stackTracePatterns) {
    const match = logs.match(pattern);
    if (match) {
      return match[0].slice(0, 1000); // Limit stack trace length
    }
  }

  return null;
}

export function extractExitCode(logs: string): number | null {
  const exitCodePatterns = [
    /exit code[:\s]+(\d+)/i,
    /exited with[:\s]+(\d+)/i,
    /process exited with code[:\s]+(\d+)/i,
    /failed with exit code[:\s]+(\d+)/i,
    /##\[error\]Process completed with exit code (\d+)/,
  ];

  for (const pattern of exitCodePatterns) {
    const match = logs.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

export function extractTimeoutInfo(logs: string): boolean {
  const timeoutPatterns = [
    /timeout/i,
    /timed out/i,
    /deadline exceeded/i,
    /operation timed out/i,
    /execution time limit/i,
  ];

  return timeoutPatterns.some(pattern => pattern.test(logs));
}

export function extractMemoryIssues(logs: string): boolean {
  const memoryPatterns = [
    /out of memory/i,
    /memory limit/i,
    /cannot allocate memory/i,
    /heap out of memory/i,
    /oom/i,
    /killed.*?memory/i,
  ];

  return memoryPatterns.some(pattern => pattern.test(logs));
}

export function extractPermissionIssues(logs: string): boolean {
  const permissionPatterns = [
    /permission denied/i,
    /access denied/i,
    /unauthorized/i,
    /forbidden/i,
    /eacces/i,
    /eperm/i,
    /not permitted/i,
  ];

  return permissionPatterns.some(pattern => pattern.test(logs));
}

export function extractNetworkIssues(logs: string): boolean {
  const networkPatterns = [
    /connection refused/i,
    /connection timeout/i,
    /network unreachable/i,
    /could not resolve/i,
    /dns/i,
    /econnrefused/i,
    /etimedout/i,
    /unable to connect/i,
    /ssl.*?error/i,
    /certificate.*?error/i,
  ];

  return networkPatterns.some(pattern => pattern.test(logs));
}

export function extractDependencyIssues(logs: string): boolean {
  const dependencyPatterns = [
    /module not found/i,
    /package not found/i,
    /cannot find module/i,
    /unresolved dependency/i,
    /missing dependency/i,
    /import error/i,
    /require.*?not found/i,
    /no such file or directory/i,
    /command not found/i,
  ];

  return dependencyPatterns.some(pattern => pattern.test(logs));
}