import * as yaml from 'js-yaml';

export interface YamlValidation {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export function validateYamlConfig(
  config: string,
  platform: 'github' | 'gitlab'
): YamlValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // First, check if it's valid YAML
  let parsed: any;
  try {
    parsed = yaml.load(config);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Invalid YAML syntax';
    return {
      valid: false,
      errors: [`YAML syntax error: ${errorMessage}`],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      errors: ['Configuration file is empty or not a valid object'],
    };
  }

  // Platform-specific validation
  if (platform === 'gitlab') {
    validateGitLabCI(parsed, errors, warnings);
  } else if (platform === 'github') {
    validateGitHubActions(parsed, errors, warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function validateGitLabCI(config: any, errors: string[], warnings: string[]) {
  // Check for common GitLab CI issues
  const reservedKeywords = [
    'image',
    'services',
    'stages',
    'types',
    'before_script',
    'after_script',
    'variables',
    'cache',
    'include',
    'default',
    'workflow',
  ];

  const jobKeys = Object.keys(config).filter(
    key => !reservedKeywords.includes(key) && !key.startsWith('.')
  );

  // Check if there are any jobs defined
  if (jobKeys.length === 0) {
    errors.push('No jobs defined in the pipeline');
  }

  // Validate each job
  jobKeys.forEach(jobName => {
    const job = config[jobName];

    if (typeof job !== 'object' || job === null) {
      errors.push(`Job '${jobName}' must be an object`);
      return;
    }

    // Check for required fields
    if (!job.script && !job.extends && !job.trigger) {
      errors.push(`Job '${jobName}' must have a 'script', 'extends', or 'trigger' field`);
    }

    // Check script format
    if (job.script) {
      if (!Array.isArray(job.script) && typeof job.script !== 'string') {
        errors.push(`Job '${jobName}' script must be a string or array of strings`);
      }
    }

    // Check dependencies
    if (job.needs) {
      if (!Array.isArray(job.needs)) {
        errors.push(`Job '${jobName}' needs must be an array`);
      } else {
        job.needs.forEach((need: any) => {
          const needName = typeof need === 'string' ? need : need.job;
          if (needName && !jobKeys.includes(needName) && !needName.includes(':')) {
            warnings.push(`Job '${jobName}' depends on '${needName}' which is not defined`);
          }
        });
      }
    }

    // Check stage reference
    if (job.stage && config.stages) {
      if (!config.stages.includes(job.stage)) {
        errors.push(`Job '${jobName}' references undefined stage '${job.stage}'`);
      }
    }
  });

  // Check stages order
  if (config.stages && !Array.isArray(config.stages)) {
    errors.push('Stages must be an array');
  }
}

function validateGitHubActions(config: any, errors: string[], warnings: string[]) {
  // Check for required workflow fields
  if (!config.name && !config.on && !config.jobs) {
    errors.push('GitHub Actions workflow must have jobs defined');
  }

  // Validate trigger events
  if (config.on) {
    if (typeof config.on === 'string') {
      // Simple trigger, valid
    } else if (Array.isArray(config.on)) {
      // Array of triggers, valid
    } else if (typeof config.on === 'object') {
      // Complex trigger configuration, valid
    } else {
      errors.push('Invalid trigger configuration in "on" field');
    }
  }

  // Validate jobs
  if (config.jobs) {
    if (typeof config.jobs !== 'object') {
      errors.push('Jobs must be an object');
      return;
    }

    const jobNames = Object.keys(config.jobs);
    if (jobNames.length === 0) {
      errors.push('No jobs defined in the workflow');
    }

    jobNames.forEach(jobName => {
      const job = config.jobs[jobName];

      if (typeof job !== 'object' || job === null) {
        errors.push(`Job '${jobName}' must be an object`);
        return;
      }

      // Check for required fields
      if (!job.steps && !job.uses) {
        errors.push(`Job '${jobName}' must have 'steps' or 'uses' field`);
      }

      // Validate steps
      if (job.steps) {
        if (!Array.isArray(job.steps)) {
          errors.push(`Job '${jobName}' steps must be an array`);
        } else if (job.steps.length === 0) {
          warnings.push(`Job '${jobName}' has no steps defined`);
        } else {
          job.steps.forEach((step: any, index: number) => {
            if (!step.run && !step.uses) {
              errors.push(`Step ${index + 1} in job '${jobName}' must have 'run' or 'uses'`);
            }
          });
        }
      }

      // Check job dependencies
      if (job.needs) {
        const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
        needs.forEach((need: string) => {
          if (!jobNames.includes(need)) {
            warnings.push(`Job '${jobName}' depends on '${need}' which is not defined`);
          }
        });
      }

      // Check matrix strategy
      if (job.strategy && job.strategy.matrix) {
        if (typeof job.strategy.matrix !== 'object') {
          errors.push(`Job '${jobName}' matrix strategy must be an object`);
        }
      }
    });
  }
}

export function extractYamlErrors(yamlString: string): string[] {
  const errors: string[] = [];

  try {
    yaml.load(yamlString);
  } catch (error) {
    if (error instanceof yaml.YAMLException) {
      const message = error.message;
      const line = (error as any).mark?.line;
      const column = (error as any).mark?.column;

      if (line !== undefined && column !== undefined) {
        errors.push(`Line ${line + 1}, Column ${column + 1}: ${message}`);
      } else {
        errors.push(message);
      }
    } else {
      errors.push(error instanceof Error ? error.message : 'Unknown YAML error');
    }
  }

  return errors;
}