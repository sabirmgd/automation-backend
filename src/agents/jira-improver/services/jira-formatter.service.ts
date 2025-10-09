import { Injectable } from '@nestjs/common';
import { ImprovedTicket } from '../schemas/ticket.schemas';

@Injectable()
export class JiraFormatterService {
  /**
   * Formats an ImprovedTicket object into JIRA wiki markup
   * Only includes sections that have meaningful content
   */
  formatToWikiMarkup(ticket: ImprovedTicket): string {
    const sections: string[] = [];

    // Always include title and description
    sections.push(`h1. ${ticket.title}`);
    sections.push('');

    // Description section
    sections.push('h2. Description');
    sections.push(this.formatDescription(ticket.description));
    sections.push('');

    // Acceptance Criteria - only if present
    if (ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0) {
      sections.push('h2. Acceptance Criteria');
      ticket.acceptanceCriteria.forEach(criteria => {
        const testableIndicator = criteria.testable ? '(/) ' : '(x) ';
        sections.push(`* ${testableIndicator}${criteria.criteria}`);
      });
      sections.push('');
    }

    // Scope - only if present and not generic
    if (ticket.scope && ticket.scope !== 'To be defined') {
      // Only add scope if it doesn't contain the standard "Out of scope" template
      const isGenericOutOfScope = ticket.scope.includes('Out of scope:') &&
        ticket.scope.includes('Changes to application functionality');

      if (!isGenericOutOfScope) {
        sections.push('h2. Scope');
        sections.push(ticket.scope);
        sections.push('');
      }
    }

    // Technical Details - only if present
    if (ticket.technicalDetails) {
      sections.push('h2. Technical Details');
      sections.push('{code}');
      sections.push(ticket.technicalDetails);
      sections.push('{code}');
      sections.push('');
    }

    // Implementation Notes section - Priority and Effort
    const hasMetadata = ticket.priority || ticket.estimatedEffort;
    if (hasMetadata) {
      sections.push('h2. Implementation Notes');
      if (ticket.priority) {
        sections.push(`*Priority:* ${this.formatPriority(ticket.priority)}`);
      }
      if (ticket.estimatedEffort) {
        sections.push(`*Estimated Effort:* ${this.formatEffort(ticket.estimatedEffort)}`);
      }
      sections.push('');
    }

    // Skip Potential Risks section - as requested
    // Risks will not be included in the formatted output

    // Labels - only if present
    if (ticket.labels && ticket.labels.length > 0) {
      sections.push('h3. Suggested Labels');
      sections.push(ticket.labels.map(label => `[${label}]`).join(' '));
    }

    return sections.join('\n').trim();
  }

  /**
   * Format description with proper JIRA wiki markup
   * Converts any markdown-style formatting to wiki markup
   */
  private formatDescription(description: string): string {
    let formatted = description;

    // Convert markdown headers to JIRA headers
    formatted = formatted.replace(/^### (.+)$/gm, 'h3. $1');
    formatted = formatted.replace(/^## (.+)$/gm, 'h3. $1');
    formatted = formatted.replace(/^# (.+)$/gm, 'h2. $1');

    // Convert markdown bold to JIRA bold
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '*$1*');

    // Convert markdown code blocks to JIRA code blocks
    formatted = formatted.replace(/```[\w]*\n([\s\S]*?)```/g, '{code}\n$1{code}');

    // Convert inline code to JIRA monospace
    formatted = formatted.replace(/`(.+?)`/g, '{{$1}}');

    // Convert markdown lists to JIRA lists (if not already in JIRA format)
    formatted = formatted.replace(/^- (.+)$/gm, '* $1');
    formatted = formatted.replace(/^\d+\. (.+)$/gm, '# $1');

    return formatted;
  }

  /**
   * Format priority with appropriate color and icon
   */
  private formatPriority(priority: string): string {
    const priorityMap: Record<string, string> = {
      critical: '{color:red}⚠ Critical{color}',
      high: '{color:orange}↑ High{color}',
      medium: '{color:blue}→ Medium{color}',
      low: '{color:green}↓ Low{color}',
    };

    return priorityMap[priority.toLowerCase()] || priority;
  }

  /**
   * Format effort estimation
   */
  private formatEffort(effort: string): string {
    const effortMap: Record<string, string> = {
      'small': 'Small (1-2 days)',
      'medium': 'Medium (3-5 days)',
      'large': 'Large (1-2 weeks)',
      'extra-large': 'Extra Large (2+ weeks)',
    };

    return effortMap[effort.toLowerCase()] || effort;
  }
}