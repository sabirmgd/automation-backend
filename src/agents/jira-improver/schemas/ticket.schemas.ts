import { z } from 'zod';

// Priority level for JIRA tickets
export const PrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);

// Acceptance criteria item
export const AcceptanceCriteriaSchema = z.object({
  criteria: z.string().describe('Single acceptance criteria item'),
  testable: z.boolean().describe('Whether this criteria is clearly testable'),
});

// Improved JIRA ticket structure
export const ImprovedTicketSchema = z.object({
  title: z.string().describe('Clear, concise ticket title in imperative mood'),
  description: z.string().describe('Well-structured description with context and purpose'),
  acceptanceCriteria: z
    .array(AcceptanceCriteriaSchema)
    .describe('Clear, testable acceptance criteria'),
  technicalDetails: z
    .string()
    .optional()
    .describe('Technical implementation notes if applicable'),
  scope: z.string().describe('Clear definition of what is in and out of scope'),
  priority: PrioritySchema.describe('Suggested priority based on description'),
  estimatedEffort: z
    .enum(['small', 'medium', 'large', 'extra-large'])
    .optional()
    .describe('Estimated effort level'),
  potentialRisks: z
    .array(z.string())
    .optional()
    .describe('Potential risks or dependencies to consider'),
  labels: z
    .array(z.string())
    .optional()
    .describe('Suggested labels for categorization'),
});

// Export TypeScript types
export type Priority = z.infer<typeof PrioritySchema>;
export type AcceptanceCriteria = z.infer<typeof AcceptanceCriteriaSchema>;
export type ImprovedTicket = z.infer<typeof ImprovedTicketSchema>;