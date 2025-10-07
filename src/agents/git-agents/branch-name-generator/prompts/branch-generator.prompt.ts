import { BranchGeneratorInput } from '../schemas/branch.schemas';

export const branchGeneratorPrompt = (input: BranchGeneratorInput) => {
  const systemPrompt = `You are a Git branch name generator expert. Your task is to create clear, concise, and git-compliant branch names from Jira ticket descriptions.

Branch Naming Conventions:
1. Use lowercase letters only
2. Separate words with hyphens (-)
3. Keep names concise but descriptive (max ${input.maxLength} chars)
4. Start with appropriate prefix based on type:
   - feature/ = new functionality
   - fix/ = bug fixes
   - hotfix/ = urgent production fixes
   - chore/ = maintenance, dependency updates
   - refactor/ = code improvements without changing functionality
   - docs/ = documentation changes
   - test/ = test additions or fixes
   - style/ = formatting, missing semicolons, etc.
   - perf/ = performance improvements
   - build/ = build system changes
   - ci/ = CI/CD changes

Branch Name Rules:
- Extract 2-4 most important keywords from the ticket
- Remove common words (the, and, or, but, for, with, etc.)
- Avoid redundancy and filler words
- No special characters except hyphens and forward slashes
- No consecutive hyphens
- Must start and end with alphanumeric characters
- Cannot use Git reserved words (HEAD, master, main, etc.)

Examples:
- "Add user authentication with OAuth2" → feature/oauth2-authentication
- "Fix navigation menu not closing on mobile devices" → fix/mobile-nav-menu-close
- "Update React from v17 to v18" → chore/update-react-v18
- "Improve database query performance for reports" → perf/optimize-report-queries
- "Refactor payment processing module" → refactor/payment-processing

Ticket ID Integration:
${input.includeTicketId ? `- Include ticket ID at the beginning if provided (e.g., PROJ-123/feature/oauth2-auth)` : '- Do not include ticket ID in branch name'}

Your Response Should Include:
1. A primary branch name that best represents the ticket
2. 2-3 alternative names with different keyword focus
3. Clear reasoning for your choices
4. Extracted keywords that influenced the naming
5. Confidence level based on ticket clarity`;

  const userPrompt = `Generate a Git branch name from this Jira ticket:

Ticket Content: ${input.ticketContent}
${input.ticketId ? `Ticket ID: ${input.ticketId}` : ''}
${input.context ? `Additional Context: ${input.context}` : ''}
${input.branchType ? `Suggested Type: ${input.branchType}` : ''}

Requirements:
- Maximum length: ${input.maxLength} characters
- Include ticket ID: ${input.includeTicketId}
- Use separator: "${input.separator}"

Please generate:
1. A primary branch name
2. 2-3 alternatives with different approaches
3. Explain your reasoning and keyword extraction
4. Indicate your confidence level (high/medium/low)
5. Confirm Git compliance`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
};

// Helper function to create simplified prompts for quick generation
export const quickBranchPrompt = (description: string, ticketId?: string) => {
  const prompt = `Create a Git branch name for: "${description}"${
    ticketId ? ` (Ticket: ${ticketId})` : ''
  }

Rules: lowercase, use hyphens, include appropriate prefix (feature/fix/chore/etc), max 50 chars.
Return only the branch name, nothing else.`;

  return prompt;
};

// Template for different branch types
export const branchTemplates = {
  feature: (keywords: string[]) => `feature/${keywords.join('-')}`,
  fix: (keywords: string[]) => `fix/${keywords.join('-')}`,
  hotfix: (keywords: string[]) => `hotfix/${keywords.join('-')}`,
  chore: (keywords: string[]) => `chore/${keywords.join('-')}`,
  refactor: (keywords: string[]) => `refactor/${keywords.join('-')}`,
  docs: (keywords: string[]) => `docs/${keywords.join('-')}`,
  test: (keywords: string[]) => `test/${keywords.join('-')}`,
  style: (keywords: string[]) => `style/${keywords.join('-')}`,
  perf: (keywords: string[]) => `perf/${keywords.join('-')}`,
  build: (keywords: string[]) => `build/${keywords.join('-')}`,
  ci: (keywords: string[]) => `ci/${keywords.join('-')}`,
};

// Keywords that suggest specific branch types
export const typeIndicators = {
  feature: ['add', 'implement', 'create', 'new', 'feature', 'introduce', 'develop'],
  fix: ['fix', 'resolve', 'solve', 'repair', 'correct', 'bug', 'issue', 'problem'],
  hotfix: ['urgent', 'critical', 'emergency', 'production', 'hotfix', 'immediate'],
  chore: ['update', 'upgrade', 'dependency', 'package', 'version', 'maintain'],
  refactor: ['refactor', 'improve', 'optimize', 'restructure', 'reorganize', 'clean'],
  docs: ['document', 'docs', 'readme', 'guide', 'tutorial', 'comment'],
  test: ['test', 'testing', 'unit', 'integration', 'e2e', 'coverage', 'spec'],
  style: ['format', 'style', 'lint', 'prettier', 'eslint', 'styling'],
  perf: ['performance', 'optimize', 'speed', 'faster', 'efficient', 'cache'],
  build: ['build', 'compile', 'webpack', 'rollup', 'bundle', 'package'],
  ci: ['ci', 'cd', 'pipeline', 'github', 'action', 'workflow', 'deploy'],
};