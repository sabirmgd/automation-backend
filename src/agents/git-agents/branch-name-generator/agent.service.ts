import { Injectable, Logger } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { ConfigService } from '@nestjs/config';
import {
  BranchGeneratorInput,
  BranchGeneratorOutput,
  BranchGeneratorInputSchema,
  BranchGeneratorOutputSchema,
  BranchType,
  validateBranchName,
  GIT_BRANCH_RULES,
} from './schemas/branch.schemas';
import {
  branchGeneratorPrompt,
  branchTemplates,
  typeIndicators,
} from './prompts/branch-generator.prompt';

@Injectable()
export class BranchNameGeneratorService {
  private readonly logger = new Logger(BranchNameGeneratorService.name);
  private model: ChatAnthropic;

  constructor(private readonly configService: ConfigService) {
    this.initializeModel();
  }

  private initializeModel() {
    this.model = new ChatAnthropic({
      apiKey: this.configService.get<string>('COCO_API_KEY'),
      model: 'claude-opus-4-1-20250805',
      temperature: 0.3,
      maxTokens: 2000,
      streaming: false,
    });
  }

  /**
   * Generate a Git branch name from a Jira ticket description
   */
  async generateBranchName(
    input: Partial<BranchGeneratorInput>,
  ): Promise<BranchGeneratorOutput> {
    this.logger.log('Starting branch name generation');

    // Validate and set defaults for input
    const validatedInput = BranchGeneratorInputSchema.parse({
      ticketContent: input.ticketContent,
      ticketId: input.ticketId,
      context: input.context,
      branchType: input.branchType,
      maxLength: input.maxLength || 50,
      includeTicketId: input.includeTicketId ?? true,
      separator: input.separator || '-',
    });

    try {
      // Use structured output with the schema
      const structuredModel = this.model.withStructuredOutput<any>(
        BranchGeneratorOutputSchema,
      );

      // Generate the prompt
      const prompt = branchGeneratorPrompt(validatedInput);

      // Get AI response
      const result = (await structuredModel.invoke(prompt)) as BranchGeneratorOutput;

      // Post-process the branch name
      const processedResult = this.postProcessBranchName(result, validatedInput);

      this.logger.log(
        `Branch name generated: ${processedResult.branchName} ` +
          `(Type: ${processedResult.type}, Confidence: ${processedResult.confidence})`,
      );

      return processedResult;
    } catch (error) {
      this.logger.error('Error generating branch name:', error);

      // Fallback to simple generation
      return this.generateFallbackBranchName(validatedInput);
    }
  }

  /**
   * Post-process the generated branch name to ensure compliance
   */
  private postProcessBranchName(
    result: BranchGeneratorOutput,
    input: BranchGeneratorInput,
  ): BranchGeneratorOutput {
    // Add ticket ID if requested
    let branchName = result.branchName;
    if (input.includeTicketId && input.ticketId) {
      const ticketPrefix = `${input.ticketId.toLowerCase()}/`;

      // Remove ticket ID if AI already included it (to avoid duplication)
      const ticketIdPattern = new RegExp(`^${input.ticketId.toLowerCase()}[\\/\\-]`, 'i');
      if (ticketIdPattern.test(branchName)) {
        // Strip the ticket ID that AI already added
        branchName = branchName.replace(ticketIdPattern, '');
      }

      // Now add the ticket ID prefix in the correct format
      if (!branchName.startsWith(ticketPrefix)) {
        branchName = ticketPrefix + branchName;
      }
    }

    // Sanitize the branch name
    branchName = this.sanitizeBranchName(branchName, input.separator);

    // Validate the branch name
    const validation = validateBranchName(branchName);

    // Truncate if too long
    if (branchName.length > input.maxLength) {
      branchName = this.truncateBranchName(branchName, input.maxLength);
    }

    return {
      ...result,
      branchName,
      gitCompliant: validation.isValid,
      alternatives: result.alternatives.map((alt) => ({
        ...alt,
        name: this.sanitizeBranchName(alt.name, input.separator),
      })),
    };
  }

  /**
   * Sanitize a branch name to be git-compliant
   */
  private sanitizeBranchName(name: string, separator: string = '-'): string {
    let sanitized = name.toLowerCase();

    // Replace invalid characters with separator
    sanitized = sanitized.replace(GIT_BRANCH_RULES.invalidChars, separator);

    // Replace multiple consecutive separators with single separator
    const separatorRegex = new RegExp(`${separator}{2,}`, 'g');
    sanitized = sanitized.replace(separatorRegex, separator);

    // Remove leading and trailing separators
    sanitized = sanitized.replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '');

    // Ensure it doesn't start or end with a dot
    sanitized = sanitized.replace(/^\.+|\.+$/g, '');

    return sanitized;
  }

  /**
   * Truncate branch name intelligently
   */
  private truncateBranchName(name: string, maxLength: number): string {
    if (name.length <= maxLength) return name;

    // Try to cut at a word boundary
    let truncated = name.substring(0, maxLength);
    const lastSeparator = truncated.lastIndexOf('-');

    if (lastSeparator > maxLength * 0.6) {
      truncated = truncated.substring(0, lastSeparator);
    }

    // Remove trailing separators
    return truncated.replace(/-+$/, '');
  }

  /**
   * Generate a simple fallback branch name
   */
  private generateFallbackBranchName(
    input: BranchGeneratorInput,
  ): BranchGeneratorOutput {
    this.logger.warn('Using fallback branch name generation');

    // Extract keywords manually
    const keywords = this.extractKeywords(input.ticketContent);

    // Detect branch type
    const detectedType = input.branchType || this.detectBranchType(input.ticketContent);

    // Generate branch name
    let branchName = branchTemplates[detectedType](keywords.slice(0, 3));

    // Add ticket ID if needed
    if (input.includeTicketId && input.ticketId) {
      branchName = `${input.ticketId.toLowerCase()}/${branchName}`;
    }

    // Sanitize and truncate
    branchName = this.sanitizeBranchName(branchName, input.separator);
    if (branchName.length > input.maxLength) {
      branchName = this.truncateBranchName(branchName, input.maxLength);
    }

    const validation = validateBranchName(branchName);

    return {
      branchName,
      alternatives: [],
      type: detectedType,
      confidence: 'low',
      reasoning: 'Generated using fallback method due to AI service error',
      keywords,
      gitCompliant: validation.isValid,
    };
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the',
      'is',
      'at',
      'which',
      'on',
      'and',
      'a',
      'an',
      'as',
      'are',
      'was',
      'were',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'should',
      'could',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'to',
      'of',
      'in',
      'for',
      'with',
      'from',
      'up',
      'about',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'under',
      'again',
      'further',
      'then',
      'once',
    ]);

    // Split text into words and filter
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    // Remove duplicates and return
    return [...new Set(words)];
  }

  /**
   * Detect branch type from content
   */
  private detectBranchType(content: string): BranchType {
    const lowerContent = content.toLowerCase();

    for (const [type, indicators] of Object.entries(typeIndicators)) {
      if (indicators.some((indicator) => lowerContent.includes(indicator))) {
        return type as BranchType;
      }
    }

    return 'feature'; // Default to feature
  }

  /**
   * Generate multiple branch name suggestions
   */
  async generateBranchNameSuggestions(
    input: Partial<BranchGeneratorInput>,
    count: number = 3,
  ): Promise<string[]> {
    const result = await this.generateBranchName(input);

    const suggestions = [result.branchName];

    if (result.alternatives) {
      suggestions.push(...result.alternatives.map((alt) => alt.name));
    }

    return suggestions.slice(0, count);
  }

  /**
   * Validate an existing branch name
   */
  validateBranchName(branchName: string): {
    isValid: boolean;
    errors: string[];
    suggestions?: string[];
  } {
    const validation = validateBranchName(branchName);

    if (!validation.isValid) {
      // Try to fix the branch name
      const sanitized = this.sanitizeBranchName(branchName);
      const revalidation = validateBranchName(sanitized);

      if (revalidation.isValid) {
        return {
          isValid: false,
          errors: validation.errors,
          suggestions: [sanitized],
        };
      }
    }

    return validation;
  }
}