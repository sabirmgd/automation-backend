import { z } from 'zod';

// Branch type enum
export const BranchTypeSchema = z.enum([
  'feature',
  'fix',
  'hotfix',
  'chore',
  'refactor',
  'docs',
  'test',
  'style',
  'perf',
  'build',
  'ci',
]);

// Confidence level for the generated branch name
export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);

// Input schema for branch name generation
export const BranchGeneratorInputSchema = z.object({
  ticketContent: z.string().describe('The Jira ticket description or content'),
  ticketId: z
    .string()
    .optional()
    .describe('Optional Jira ticket ID (e.g., PROJ-123)'),
  context: z
    .string()
    .optional()
    .describe('Additional context or specific instructions'),
  branchType: BranchTypeSchema.optional().describe(
    'Optional hint for the type of branch to generate',
  ),
  maxLength: z
    .number()
    .min(20)
    .max(100)
    .default(50)
    .describe('Maximum length for the branch name'),
  includeTicketId: z
    .boolean()
    .default(true)
    .describe('Whether to include the ticket ID in the branch name'),
  separator: z
    .enum(['-', '_', '/'])
    .default('-')
    .describe('Character to use as separator in branch names'),
});

// Alternative branch name suggestion
export const BranchAlternativeSchema = z.object({
  name: z.string().describe('Alternative branch name'),
  reasoning: z.string().describe('Why this alternative was suggested'),
});

// Output schema for generated branch names
export const BranchGeneratorOutputSchema = z.object({
  branchName: z.string().describe('The primary suggested branch name'),
  alternatives: z
    .array(BranchAlternativeSchema)
    .max(3)
    .describe('Alternative branch name suggestions'),
  type: BranchTypeSchema.describe('Detected or assigned branch type'),
  confidence: ConfidenceLevelSchema.describe(
    'Confidence level in the generated name',
  ),
  reasoning: z.string().describe('Explanation of the naming choice'),
  keywords: z
    .array(z.string())
    .describe('Key words extracted from the ticket'),
  gitCompliant: z
    .boolean()
    .describe('Whether the branch name is git-compliant'),
});

// TypeScript types
export type BranchType = z.infer<typeof BranchTypeSchema>;
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;
export type BranchGeneratorInput = z.infer<typeof BranchGeneratorInputSchema>;
export type BranchAlternative = z.infer<typeof BranchAlternativeSchema>;
export type BranchGeneratorOutput = z.infer<typeof BranchGeneratorOutputSchema>;

// Git branch naming rules and constraints
export const GIT_BRANCH_RULES = {
  // Reserved words that cannot be used in branch names
  reservedWords: [
    'HEAD',
    'FETCH_HEAD',
    'MERGE_HEAD',
    'ORIG_HEAD',
    'master',
    'main',
    'develop',
    'dev',
    'staging',
    'production',
    'release',
  ],

  // Characters that are not allowed in branch names
  invalidChars: /[\s~^:?*\[\]\\@{}'"`!#$%&()+=,;<>|]/g,

  // Pattern for valid branch names
  validPattern: /^[a-z0-9][a-z0-9\-\_\/]*[a-z0-9]$/,

  // Maximum length for branch names
  maxLength: 100,

  // Minimum length for branch names
  minLength: 3,
};

// Helper function to validate branch name
export function validateBranchName(name: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (name.length < GIT_BRANCH_RULES.minLength) {
    errors.push(`Branch name too short (min ${GIT_BRANCH_RULES.minLength} chars)`);
  }

  if (name.length > GIT_BRANCH_RULES.maxLength) {
    errors.push(`Branch name too long (max ${GIT_BRANCH_RULES.maxLength} chars)`);
  }

  if (!GIT_BRANCH_RULES.validPattern.test(name)) {
    errors.push('Branch name contains invalid characters or format');
  }

  if (GIT_BRANCH_RULES.reservedWords.includes(name.toLowerCase())) {
    errors.push('Branch name uses reserved word');
  }

  if (name.includes('..')) {
    errors.push('Branch name cannot contain consecutive dots');
  }

  if (name.endsWith('.lock')) {
    errors.push('Branch name cannot end with .lock');
  }

  if (name.endsWith('/')) {
    errors.push('Branch name cannot end with slash');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}