import { z } from 'zod';

// Change type for key changes with corresponding emojis
export const ChangeTypeSchema = z.enum([
  'feature',
  'bug',
  'config',
  'docs',
  'test',
  'refactor',
  'security',
  'performance',
]);

// File change schema for Changes table
export const FileChangeSchema = z.object({
  file: z.string().describe('File path in relevant-directory/filename format'),
  changeSummary: z
    .string()
    .describe('Brief description of what was changed in this file'),
});

// Key change schema with type and description
export const KeyChangeSchema = z.object({
  type: ChangeTypeSchema.describe('Type of change for emoji selection'),
  description: z.string().describe('Clear description of the change'),
});

// Review focus areas with different alert types
export const ReviewFocusAreasSchema = z.object({
  important: z
    .array(z.string())
    .optional()
    .describe('Critical areas needing careful review'),
  warning: z
    .array(z.string())
    .optional()
    .describe('Potential risks or breaking changes'),
  note: z
    .array(z.string())
    .optional()
    .describe('Additional context or considerations'),
});

// Impact assessment schema
export const ImpactAssessmentSchema = z.object({
  breakingChanges: z
    .boolean()
    .describe('Whether this introduces breaking changes'),
  databaseSchema: z
    .enum(['modified', 'unchanged'])
    .describe('Database schema impact'),
  apiChanges: z.boolean().describe('Whether API contracts are modified'),
  securityImpact: z
    .enum(['high', 'medium', 'low', 'none'])
    .describe('Security impact level'),
  performanceImpact: z
    .enum(['positive', 'negative', 'neutral', 'unknown'])
    .describe('Performance impact'),
});

// Main summary schema (CodeRabbit style)
export const SummarySchema = z.object({
  walkthrough: z
    .string()
    .describe('2-3 sentences describing the main purpose and changes'),
  changes: z
    .array(FileChangeSchema)
    .describe('List of file changes for the Changes table'),
  keyChanges: z
    .array(KeyChangeSchema)
    .describe('List of key changes with types for emoji formatting'),
  reviewFocusAreas: ReviewFocusAreasSchema.describe(
    'Areas requiring special attention during review',
  ),
  impactAssessment: ImpactAssessmentSchema.describe(
    'Assessment of change impact across different dimensions',
  ),
});

// Comment mode for inline comments
export const CommentModeSchema = z.enum(['SINGLE_LINE', 'RANGE']);

// Severity levels for suggestions
export const SeveritySchema = z.enum(['critical', 'major', 'minor', 'info']);

// Suggestion types
export const SuggestionTypeSchema = z.enum([
  'ERROR',
  'WARNING',
  'IMPROVEMENT',
  'SECURITY',
  'PERFORMANCE',
  'BEST_PRACTICE',
]);

// Code review suggestion schema (enhanced for inline comments)
export const ReviewSuggestionSchema = z.object({
  action: z.string().describe('Single-line imperative action description'),
  reason: z.string().describe('Brief explanation of why this change is needed'),
  patch: z
    .string()
    .optional()
    .describe('Diff-style code change in unified diff format'),
  file: z
    .string()
    .describe(
      'REQUIRED: The exact file path from the diff where the issue is located',
    ),
  // Line number fields for inline comments
  commentMode: CommentModeSchema.optional().describe(
    'Whether this is a single line or range comment',
  ),
  startLine: z
    .number()
    .optional()
    .describe('Starting line number for the comment (in the new file)'),
  endLine: z
    .number()
    .optional()
    .describe('Ending line number for RANGE mode comments'),
  // Additional metadata for inline comments
  suggestionType:
    SuggestionTypeSchema.optional().describe('Type of suggestion'),
  severity: SeveritySchema.optional().describe('Severity level of the issue'),
  // Legacy field for backward compatibility
  lineNumber: z
    .number()
    .optional()
    .describe(
      'Legacy: Line number if suggestion is line-specific (use startLine instead)',
    ),
});

// Main detailed review schema
export const DetailedReviewSchema = z.object({
  suggestions: z
    .array(ReviewSuggestionSchema)
    .describe('List of code review suggestions'),
  overallAssessment: z
    .string()
    .describe(
      'Overall assessment - either specific suggestions or "LGTM — no suggestions."',
    ),
});

// Export TypeScript types for use in other files
export type SummaryOutput = z.infer<typeof SummarySchema>;
export type DetailedReviewOutput = z.infer<typeof DetailedReviewSchema>;
export type FileChange = z.infer<typeof FileChangeSchema>;
export type KeyChange = z.infer<typeof KeyChangeSchema>;
export type ReviewSuggestion = z.infer<typeof ReviewSuggestionSchema>;
export type ChangeType = z.infer<typeof ChangeTypeSchema>;
export type CommentMode = z.infer<typeof CommentModeSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type SuggestionType = z.infer<typeof SuggestionTypeSchema>;

// Diagram type schema for different Mermaid diagram types
export const DiagramTypeSchema = z.enum([
  'flowchart',
  'sequence',
  'class',
  'state',
  'gantt',
  'er',
  'journey',
  'gitgraph',
  'architecture',
  'dataflow',
]);

// Mermaid diagram validation status
export const DiagramValidationStatusSchema = z.enum([
  'valid',
  'invalid',
  'pending',
]);

// Individual diagram schema
export const DiagramSchema = z.object({
  diagramType: DiagramTypeSchema.describe(
    'Type of Mermaid diagram to generate based on code changes',
  ),
  title: z.string().describe('Clear, descriptive title for the diagram'),
  description: z
    .string()
    .describe(
      'Brief explanation of what the diagram represents and key components',
    ),
  mermaidCode: z
    .string()
    .describe(
      'Valid Mermaid diagram code without backticks or language markers',
    ),
  focusAreas: z
    .array(z.string())
    .optional()
    .describe(
      'Key areas or components highlighted in the diagram that reviewers should focus on',
    ),
  complexity: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Complexity level of the changes visualized'),
});

// Main diagram generation output schema
export const DiagramGenerationSchema = z.object({
  primaryDiagram: DiagramSchema.describe(
    'Main diagram representing the overall changes',
  ),
  supplementaryDiagrams: z
    .array(DiagramSchema)
    .optional()
    .describe(
      'Additional diagrams for specific aspects or detailed views',
    ),
  summary: z
    .string()
    .describe(
      'Overall summary of the architectural changes visualized in the diagrams',
    ),
  impactedComponents: z
    .array(z.string())
    .describe('List of components/modules affected by the changes'),
  suggestedReviewFlow: z
    .string()
    .optional()
    .describe(
      'Suggested order for reviewing the code based on the diagram analysis',
    ),
});

// Export TypeScript types for diagrams
export type DiagramType = z.infer<typeof DiagramTypeSchema>;
export type Diagram = z.infer<typeof DiagramSchema>;
export type DiagramGeneration = z.infer<typeof DiagramGenerationSchema>;
export type DiagramValidationStatus = z.infer<typeof DiagramValidationStatusSchema>;
