import { PipelineFailureType } from '../schemas/pipeline-analysis.schema';

export interface QuickPipelineDetection {
  type: PipelineFailureType;
  confidence: 'high' | 'medium' | 'low';
  suggestedFix?: string;
}

export interface YamlValidation {
  valid: boolean;
  errors: string[];
}

export function detectPipelineFailureType(
  hasConfigError: boolean,
  failedJobsCount: number,
  errorMessage: string,
  yamlValidation: YamlValidation | null
): QuickPipelineDetection | null {
  const lowerError = errorMessage.toLowerCase();

  // Check for YAML syntax errors
  if (hasConfigError || (yamlValidation && !yamlValidation.valid)) {
    return {
      type: 'yaml_syntax_error',
      confidence: 'high',
      suggestedFix:
        'Fix YAML syntax errors in your pipeline configuration file',
    };
  }

  // Check for job dependency errors
  if (hasJobDependencyError(lowerError)) {
    return {
      type: 'job_dependency_error',
      confidence: 'high',
      suggestedFix:
        'Check job dependencies - ensure all referenced jobs exist and have no circular dependencies',
    };
  }

  // Check for missing job definitions
  if (hasMissingJobDefinition(lowerError)) {
    return {
      type: 'missing_job_definition',
      confidence: 'high',
      suggestedFix:
        'Add missing job definitions or fix job references in your pipeline',
    };
  }

  // Check for invalid configuration
  if (hasInvalidConfiguration(lowerError)) {
    return {
      type: 'invalid_configuration',
      confidence: 'high',
      suggestedFix:
        'Review and fix invalid configuration settings in your pipeline file',
    };
  }

  // Check for pipeline timeout
  if (hasPipelineTimeout(lowerError)) {
    return {
      type: 'pipeline_timeout',
      confidence: 'high',
      suggestedFix:
        'Increase pipeline timeout or optimize long-running jobs',
    };
  }

  // Check for multiple job failures
  if (failedJobsCount > 1) {
    return {
      type: 'multiple_job_failures',
      confidence: 'medium',
      suggestedFix: `Investigate ${failedJobsCount} failed jobs - check for common issues across failures`,
    };
  }

  // Check for resource constraints
  if (hasResourceConstraint(lowerError)) {
    return {
      type: 'resource_constraint',
      confidence: 'medium',
      suggestedFix:
        'Check runner availability and resource limits for your pipeline',
    };
  }

  // Check for permission issues
  if (hasPermissionIssue(lowerError)) {
    return {
      type: 'permission_issue',
      confidence: 'medium',
      suggestedFix:
        'Verify API tokens, credentials, and repository permissions',
    };
  }

  // Check for network issues
  if (hasNetworkIssue(lowerError)) {
    return {
      type: 'network_issue',
      confidence: 'medium',
      suggestedFix:
        'Check network connectivity and external service availability',
    };
  }

  return null;
}

function hasJobDependencyError(error: string): boolean {
  const patterns = [
    'dependency',
    'dependencies',
    'needs',
    'required job',
    'job not found',
    'circular dependency',
    'dependency cycle',
    'missing dependency',
    'unmet dependency',
  ];

  return patterns.some(pattern => error.includes(pattern));
}

function hasMissingJobDefinition(error: string): boolean {
  const patterns = [
    'job not defined',
    'undefined job',
    'unknown job',
    'job does not exist',
    'no such job',
    'job.*not found',
    'missing job',
  ];

  return patterns.some(pattern => error.includes(pattern));
}

function hasInvalidConfiguration(error: string): boolean {
  const patterns = [
    'invalid configuration',
    'configuration error',
    'invalid value',
    'invalid option',
    'unrecognized',
    'not allowed',
    'unexpected key',
    'unknown field',
    'validation error',
    'schema error',
  ];

  return patterns.some(pattern => error.includes(pattern));
}

function hasPipelineTimeout(error: string): boolean {
  const patterns = [
    'pipeline timeout',
    'execution time',
    'time limit exceeded',
    'deadline exceeded',
    'workflow timeout',
  ];

  return patterns.some(pattern => error.includes(pattern));
}

function hasResourceConstraint(error: string): boolean {
  const patterns = [
    'no runners',
    'runner not available',
    'resource limit',
    'quota exceeded',
    'insufficient',
    'out of resources',
    'capacity',
  ];

  return patterns.some(pattern => error.includes(pattern));
}

function hasPermissionIssue(error: string): boolean {
  const patterns = [
    'permission denied',
    'access denied',
    'unauthorized',
    'forbidden',
    'authentication',
    'credentials',
    'token invalid',
    'token expired',
  ];

  return patterns.some(pattern => error.includes(pattern));
}

function hasNetworkIssue(error: string): boolean {
  const patterns = [
    'connection',
    'network',
    'timeout',
    'unreachable',
    'dns',
    'ssl',
    'certificate',
    'proxy',
  ];

  return patterns.some(pattern => error.includes(pattern));
}