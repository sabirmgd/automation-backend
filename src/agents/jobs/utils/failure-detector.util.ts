import { JobFailureType } from '../schemas/job-analysis.schema';
import {
  extractExitCode,
  extractTimeoutInfo,
  extractMemoryIssues,
  extractPermissionIssues,
  extractNetworkIssues,
  extractDependencyIssues,
} from './log-parser.util';

export interface QuickDetection {
  type: JobFailureType;
  confidence: 'high' | 'medium' | 'low';
  suggestedFix?: string;
}

export function detectFailureType(
  logs: string,
  errorPatterns: string[]
): QuickDetection | null {
  const lowerLogs = logs.toLowerCase();
  const combinedPatterns = errorPatterns.join(' ').toLowerCase();

  // Check for syntax errors
  if (hasSyntaxError(lowerLogs, combinedPatterns)) {
    return {
      type: 'syntax_error',
      confidence: 'high',
      suggestedFix: 'Check for syntax errors in your scripts or configuration files',
    };
  }

  // Check for configuration errors
  if (hasConfigurationError(lowerLogs, combinedPatterns)) {
    return {
      type: 'configuration_error',
      confidence: 'high',
      suggestedFix: 'Review your CI/CD configuration file for invalid settings',
    };
  }

  // Check for dependency issues
  if (extractDependencyIssues(logs)) {
    return {
      type: 'dependency_issue',
      confidence: 'high',
      suggestedFix: 'Install missing dependencies or update your package manager cache',
    };
  }

  // Check for resource constraints
  if (extractTimeoutInfo(logs) || extractMemoryIssues(logs)) {
    return {
      type: 'resource_constraint',
      confidence: 'high',
      suggestedFix: 'Increase timeout limits or memory allocation for the job',
    };
  }

  // Check for permission issues
  if (extractPermissionIssues(logs)) {
    return {
      type: 'permission_issue',
      confidence: 'high',
      suggestedFix: 'Check file permissions and API access tokens',
    };
  }

  // Check for network issues
  if (extractNetworkIssues(logs)) {
    return {
      type: 'network_issue',
      confidence: 'high',
      suggestedFix: 'Verify network connectivity and firewall settings',
    };
  }

  // Check for test failures
  if (hasTestFailure(lowerLogs, combinedPatterns)) {
    return {
      type: 'test_failure',
      confidence: 'medium',
      suggestedFix: 'Review and fix the failing tests',
    };
  }

  // Check for build errors
  if (hasBuildError(lowerLogs, combinedPatterns)) {
    return {
      type: 'build_error',
      confidence: 'medium',
      suggestedFix: 'Check compilation errors and build configuration',
    };
  }

  // Check for environment issues
  if (hasEnvironmentIssue(lowerLogs, combinedPatterns)) {
    return {
      type: 'environment_issue',
      confidence: 'medium',
      suggestedFix: 'Verify environment variables and secrets are properly configured',
    };
  }

  // Check exit code for additional clues
  const exitCode = extractExitCode(logs);
  if (exitCode !== null && exitCode !== 0) {
    return getFailureTypeByExitCode(exitCode);
  }

  return null;
}

function hasSyntaxError(logs: string, patterns: string): boolean {
  const syntaxIndicators = [
    'syntax error',
    'syntaxerror',
    'unexpected token',
    'unexpected end',
    'invalid syntax',
    'parse error',
    'parsing error',
    'yaml error',
    'json error',
    'malformed',
  ];

  return syntaxIndicators.some(indicator =>
    logs.includes(indicator) || patterns.includes(indicator)
  );
}

function hasConfigurationError(logs: string, patterns: string): boolean {
  const configIndicators = [
    'configuration error',
    'invalid configuration',
    'missing configuration',
    'unknown option',
    'invalid option',
    'unrecognized',
    'not a valid',
    'invalid value',
    'required field',
    'missing required',
  ];

  return configIndicators.some(indicator =>
    logs.includes(indicator) || patterns.includes(indicator)
  );
}

function hasTestFailure(logs: string, patterns: string): boolean {
  const testIndicators = [
    'test failed',
    'tests failed',
    'failing test',
    'assertion failed',
    'expected',
    'actual',
    'test suite failed',
    '✗',
    'fail:',
    'failure:',
    'failed:',
  ];

  return testIndicators.some(indicator =>
    logs.includes(indicator) || patterns.includes(indicator)
  );
}

function hasBuildError(logs: string, patterns: string): boolean {
  const buildIndicators = [
    'build failed',
    'compilation error',
    'compile error',
    'build error',
    'make error',
    'webpack error',
    'rollup error',
    'tsc error',
    'typescript error',
    'babel error',
  ];

  return buildIndicators.some(indicator =>
    logs.includes(indicator) || patterns.includes(indicator)
  );
}

function hasEnvironmentIssue(logs: string, patterns: string): boolean {
  const envIndicators = [
    'environment variable',
    'env var',
    'secret not found',
    'missing secret',
    'undefined variable',
    'not defined',
    'credential',
    'authentication failed',
    'auth error',
  ];

  return envIndicators.some(indicator =>
    logs.includes(indicator) || patterns.includes(indicator)
  );
}

function getFailureTypeByExitCode(exitCode: number): QuickDetection | null {
  const exitCodeMap: Record<number, QuickDetection> = {
    1: {
      type: 'unknown',
      confidence: 'low',
      suggestedFix: 'General error - check logs for specific details',
    },
    2: {
      type: 'configuration_error',
      confidence: 'medium',
      suggestedFix: 'Misuse of shell command or configuration issue',
    },
    126: {
      type: 'permission_issue',
      confidence: 'high',
      suggestedFix: 'Command found but not executable - check file permissions',
    },
    127: {
      type: 'dependency_issue',
      confidence: 'high',
      suggestedFix: 'Command not found - install missing dependencies',
    },
    128: {
      type: 'configuration_error',
      confidence: 'medium',
      suggestedFix: 'Invalid argument to exit - check script syntax',
    },
    137: {
      type: 'resource_constraint',
      confidence: 'high',
      suggestedFix: 'Process killed (SIGKILL) - likely out of memory',
    },
    143: {
      type: 'resource_constraint',
      confidence: 'high',
      suggestedFix: 'Process terminated (SIGTERM) - likely timeout or manual termination',
    },
  };

  return exitCodeMap[exitCode] || null;
}