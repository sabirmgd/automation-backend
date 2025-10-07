import { JiraTicket } from '../modules/jira/entities/jira-ticket.entity';
import { Project } from '../projects/project.entity';
import { HiddenComment, AuthorType } from '../modules/jira/entities/hidden-comment.entity';

export class CreatePreliminaryAnalysisPromptsBuilder {
  private project: Project;
  private ticket: JiraTicket;
  private inspectJiraPrompt: string | null;
  private hiddenComments: HiddenComment[];

  constructor() {
    this.hiddenComments = [];
  }

  setProject(project: Project): this {
    this.project = project;
    return this;
  }

  setTicket(ticket: JiraTicket): this {
    this.ticket = ticket;
    return this;
  }

  setInspectJiraPrompt(prompt: string | null): this {
    this.inspectJiraPrompt = prompt;
    return this;
  }

  setHiddenComments(comments: HiddenComment[]): this {
    this.hiddenComments = comments;
    return this;
  }

  buildPrompt(): string {
    if (!this.project || !this.ticket) {
      throw new Error('Project and ticket are required to build prompt');
    }

    const sections: string[] = [];

    // System Context
    sections.push(this.buildSystemContext());

    // Mission Statement
    sections.push(this.buildMissionStatement());

    // Project Context
    sections.push(this.buildProjectContext());

    // Ticket Information
    sections.push(this.buildTicketInformation());

    // Previous Analysis Context (Hidden Comments)
    if (this.hiddenComments.length > 0) {
      sections.push(this.buildPreviousAnalysisContext());
    }

    // Custom Instructions (INSPECT_JIRA prompt)
    if (this.inspectJiraPrompt) {
      sections.push(this.buildCustomInstructions());
    }

    // Investigation Requirements
    sections.push(this.buildInvestigationRequirements());

    // Output Requirements
    sections.push(this.buildOutputRequirements());

    return sections.filter(Boolean).join('\n\n');
  }

  private buildSystemContext(): string {
    return `You are a senior software engineer with deep expertise in code analysis and implementation planning.
You have been given FULL access to the entire codebase and must perform a THOROUGH investigation.

CRITICAL REQUIREMENTS:
- Achieve 99% confidence in your analysis before concluding
- Investigate ALL related files, not just the obvious ones
- Trace COMPLETE execution flows from start to finish
- Consider ALL edge cases, error scenarios, and dependencies
- This is a SINGLE-TURN analysis - be comprehensive as you won't be asked follow-up questions`;
  }

  private buildMissionStatement(): string {
    return `MISSION: Perform a preliminary analysis for implementing Jira ticket ${this.ticket.key}
Your analysis must be so detailed and complete that another developer could implement the solution without any questions.
Create a comprehensive A-Z implementation plan that can be directly approved and executed.`;
  }

  private buildProjectContext(): string {
    const sections = [
      '=== PROJECT CONTEXT ===',
      `Project Name: ${this.project.name}`,
      `Working Directory: ${this.project.localPath}`,
    ];

    if (this.project.description) {
      sections.push(`Description: ${this.project.description}`);
    }

    if (this.project.agentNavigationInfo) {
      sections.push(`\nProject Navigation Info:\n${this.project.agentNavigationInfo}`);
    }

    if (this.project.metadata && Object.keys(this.project.metadata).length > 0) {
      sections.push(`\nProject Metadata:\n${JSON.stringify(this.project.metadata, null, 2)}`);
    }

    return sections.join('\n');
  }

  private buildTicketInformation(): string {
    const sections = [
      '=== JIRA TICKET INFORMATION ===',
      `Ticket: ${this.ticket.key}`,
      `Type: ${this.ticket.issueType}`,
      `Status: ${this.ticket.status}`,
      `Priority: ${this.ticket.priority || 'Not specified'}`,
      `Summary: ${this.ticket.summary}`,
    ];

    if (this.ticket.description) {
      sections.push(`\nDescription:\n${this.ticket.description}`);
    }

    if (this.ticket.labels && this.ticket.labels.length > 0) {
      sections.push(`Labels: ${this.ticket.labels.join(', ')}`);
    }

    if (this.ticket.epicKey) {
      sections.push(`Epic: ${this.ticket.epicKey}`);
    }

    if (this.ticket.parentKey) {
      sections.push(`Parent: ${this.ticket.parentKey}`);
    }

    if (this.ticket.storyPoints) {
      sections.push(`Story Points: ${this.ticket.storyPoints}`);
    }

    return sections.join('\n');
  }

  private buildPreviousAnalysisContext(): string {
    const sections = ['=== PREVIOUS ANALYSIS & COMMENTS ==='];
    sections.push('The following comments and analyses have been made on this ticket:');
    sections.push('(Use these to understand context and avoid repeating work)\n');

    this.hiddenComments.forEach((comment, index) => {
      const authorLabel = comment.authorType === AuthorType.AI
        ? `AI (${comment.authorName || 'Claude'})`
        : `User (${comment.authorName || 'Developer'})`;

      sections.push(`--- Comment #${index + 1} by ${authorLabel} ---`);
      sections.push(`Date: ${comment.createdAt}`);
      sections.push(`Content:\n${comment.content}`);
      sections.push('');
    });

    return sections.join('\n');
  }

  private buildCustomInstructions(): string {
    return `=== PROJECT-SPECIFIC INSTRUCTIONS ===\n${this.inspectJiraPrompt}`;
  }

  private buildInvestigationRequirements(): string {
    return `=== INVESTIGATION REQUIREMENTS ===

1. CODE DISCOVERY
   - Find ALL files that relate to this ticket's functionality
   - Trace the complete execution path from entry points to data persistence
   - Identify ALL dependencies, imports, and exports
   - Map data flows from input to output
   - Check for existing similar implementations you can learn from

2. DEEP ANALYSIS CHECKLIST
   � Controllers/Routes - entry points and request handling
   � Services - business logic and orchestration
   � Entities/Models - data structures and relationships
   � DTOs - data validation and transformation
   � Database - schemas, migrations, queries
   � Configuration - environment variables, feature flags
   � Middleware/Guards/Interceptors - cross-cutting concerns
   � Error Handling - try-catch blocks, error boundaries
   � Tests - existing test coverage and patterns
   � External Services - APIs, third-party integrations
   � Security - authentication, authorization, data validation
   � Performance - potential bottlenecks, caching opportunities

3. PATTERN RECOGNITION
   - Identify coding patterns used in this codebase
   - Note naming conventions and file organization
   - Understand the architecture style (MVC, DDD, etc.)
   - Recognize team preferences for implementation approaches`;
  }

  private buildOutputRequirements(): string {
    return `=== REQUIRED OUTPUT STRUCTURE ===

Your analysis must include ALL of the following sections:

## 1. UNDERSTANDING CONFIRMATION
- Restate the problem in your own words
- Confirm what needs to be built/fixed/changed
- List any assumptions you're making
- Identify any ambiguities that need clarification

## 2. CODEBASE INVESTIGATION SUMMARY
- List ALL files you examined (organize by category)
- Document the current implementation flow
- Map all dependencies and their relationships
- Identify the patterns and conventions used

## 3. IF this is a bug, root cause analysis
- Describe the exact issue and its impact
- Trace the root cause in the codebase

## 4. Proposed Solution Overview
- High-level description of your proposed solution
- Justify why this approach is best
- Discuss alternatives you considered and why you rejected them

## 5. DETAILED IMPLEMENTATION PLAN :
If the problem can simply be solved, no need for steps, mention id
Provide a step-by-step plan that includes:

### Step 1: [First task]
- File to modify/create: [exact path]
- What to do: [specific changes]
- Code snippet or pseudocode
- Why this step first: [reasoning]

### Step 2: [Second task]
- File to modify/create: [exact path]
- What to do: [specific changes]
- Code snippet or pseudocode
- Dependencies on Step 1: [what needs to be complete]

[Continue for all steps...]

## 5. TECHNICAL SPECIFICATIONS
- New functions/methods to create (with signatures)
- Data structures and type definitions
- API endpoints and their contracts
- Database changes (tables, columns, indexes)
- Configuration changes needed

## 6. INTEGRATION POINTS
- How this fits with existing code
- Services that need to be updated
- Breaking changes to watch for
- Backward compatibility considerations

## 7. QUESTIONS & BLOCKERS
- Any unclear requirements
- Technical decisions needing input
- Missing information or access needed
- Suggested alternatives if applicable

Remember: Be EXHAUSTIVE. It's better to over-analyze than to miss critical details.
Your analysis should be so complete that implementation becomes mechanical.`;
  }

  /**
   * Build the Claude CLI command
   * Returns command array and prompt separately for file-based approach
   */
  buildCommand(_prompt: string): string[] {
    // Don't include the prompt in the command - we'll handle it separately
    return [
      'claude',
      '--model',
      'claude-opus-4-1-20250805',
      '--allowedTools',
      'Read,Grep',
      '--permission-mode',
      'acceptEdits',
      '--max-turns',
      '3',
      '--disallowedTools',
      'Bash'
    ];
  }

  getPrompt(): string {
    return this.buildPrompt();
  }

  /**
   * Build a simple prompt for resuming a conversation with just a user note
   */
  buildUserNotePrompt(userNote: string): string {
    if (!this.ticket) {
      throw new Error('Ticket is required to build user note prompt');
    }

    const sections: string[] = [];

    sections.push('=== CONTINUATION REQUEST ===');
    sections.push(`Continuing analysis for ticket ${this.ticket.key}: ${this.ticket.summary}`);
    sections.push('');
    sections.push('User Note:');
    sections.push(userNote);
    sections.push('');
    sections.push('Please address the user\'s note above, considering the previous context of our conversation.');

    return sections.join('\n');
  }
}