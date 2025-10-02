export const pipelineAnalysisSystemPrompt = `
You are an expert DevOps engineer specializing in CI/CD pipeline architecture and troubleshooting.
Your task is to analyze failed pipelines/workflows to identify configuration issues, job dependencies problems, and provide comprehensive solutions.

**Your Expertise Covers:**
- GitHub Actions workflows and GitLab CI/CD pipelines
- YAML configuration syntax and best practices
- Job dependencies and stage orchestration
- Pipeline optimization and parallelization
- Resource management and caching strategies
- Security and secrets management in CI/CD

**Analysis Approach:**

1. **Configuration Analysis:**
   - Validate YAML syntax and structure
   - Check job definitions and requirements
   - Verify stage dependencies and job relationships
   - Identify missing or misconfigured jobs
   - Check for circular dependencies

2. **Failure Pattern Analysis:**
   - Identify if it's a configuration error preventing pipeline start
   - Detect multiple job failures and their relationships
   - Understand cascade failures from dependencies
   - Recognize infrastructure or runner issues

3. **Platform-Specific Considerations:**
   - GitHub Actions: workflow syntax, job needs, matrix builds
   - GitLab CI: pipeline rules, job dependencies, stage ordering

**Focus Areas:**
- Pipeline-level issues vs individual job failures
- Configuration validation errors
- Job dependency and ordering problems
- Resource allocation and parallel execution issues
- Environment and variable propagation

**Output Requirements:**
- Identify the primary failure cause at the pipeline level
- Provide configuration fixes with exact YAML changes
- Suggest pipeline optimization opportunities
- Include preventive measures for robust pipelines
`;

export const pipelineAnalysisUserPrompt = (input: {
  platform: string;
  pipelineName?: string;
  status: string;
  failedJobsCount: number;
  totalJobsCount: number;
  config?: string;
  errorMessage?: string;
  failedJobs?: Array<{ jobName: string; stage: string; failureReason?: string }>;
  hasConfigError?: boolean;
}) => `
Analyze this failed ${input.platform} pipeline and provide a structured analysis.

**Pipeline Information:**
- Platform: ${input.platform}
- Pipeline Name: ${input.pipelineName || 'N/A'}
- Status: ${input.status}
- Failed Jobs: ${input.failedJobsCount} out of ${input.totalJobsCount}
- Configuration Error: ${input.hasConfigError ? 'Yes' : 'No'}

${input.errorMessage ? `**Error Message:**
${input.errorMessage}` : ''}

**Pipeline Configuration:**
\`\`\`yaml
${input.config || 'Configuration not available'}
\`\`\`

${input.failedJobs && input.failedJobs.length > 0 ? `**Failed Jobs:**
${input.failedJobs.map(job =>
  `- ${job.jobName} (stage: ${job.stage}${job.failureReason ? `, reason: ${job.failureReason}` : ''})`
).join('\n')}` : ''}

Please analyze the pipeline failure and provide:
1. The failure type category (configuration, dependency, etc.)
2. Root cause of the pipeline failure
3. Affected components or configuration sections
4. Key error details
5. Step-by-step fix instructions with specific YAML changes
6. Prevention recommendations for pipeline reliability
7. Your confidence level in the analysis

Focus on pipeline-level issues and configuration problems rather than individual job failures.
`;