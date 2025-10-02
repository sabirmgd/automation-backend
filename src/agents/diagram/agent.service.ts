import { Injectable, Logger } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { ConfigService } from '@nestjs/config';
import { DiagramGenerationSchema, DiagramGeneration } from '../review/schemas/review.schemas';
import { diagramPrompt } from './prompts/diagram.prompt';

@Injectable()
export class DiagramAgentService {
  private readonly logger = new Logger(DiagramAgentService.name);
  private model: ChatAnthropic;

  constructor(private readonly configService: ConfigService) {
    this.initializeModel();
  }

  private initializeModel() {
    this.model = new ChatAnthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
      model: 'claude-opus-4-1-20250805',
      temperature: 0.3,
      maxTokens: 10000,
      streaming: true,
    });
  }

  async generateDiagram(
    diff: string,
    context?: {
      title?: string;
      description?: string;
      author?: string;
      targetBranch?: string;
      filesChanged?: number;
    },
    extraInstructions?: string,
  ): Promise<DiagramGeneration> {
    this.logger.log('Starting diagram generation with Claude Opus');

    const contextInfo = context
      ? `
PR Title: ${context.title || 'N/A'}
Description: ${context.description || 'N/A'}
Author: ${context.author || 'N/A'}
Target Branch: ${context.targetBranch || 'N/A'}
Files Changed: ${context.filesChanged || 'N/A'}
`.trim()
      : '';

    const enhancedDiff = contextInfo ? `${contextInfo}\n\n---\n\n${diff}` : diff;

    // Use structured output with the schema
    const structuredModel = this.model.withStructuredOutput<any>(DiagramGenerationSchema);

    try {
      const currentPrompt = diagramPrompt(enhancedDiff, extraInstructions);
      const result = await structuredModel.invoke(currentPrompt) as DiagramGeneration;

      // Clean the mermaid code if needed
      if (result.primaryDiagram?.mermaidCode) {
        result.primaryDiagram.mermaidCode = this.cleanMermaidCode(result.primaryDiagram.mermaidCode);
      }

      // Clean supplementary diagrams if any
      if (result.supplementaryDiagrams?.length > 0) {
        result.supplementaryDiagrams = result.supplementaryDiagrams.map(diagram => ({
          ...diagram,
          mermaidCode: this.cleanMermaidCode(diagram.mermaidCode),
        }));
      }

      this.logger.log(
        `Diagram generation completed. Primary: ${result.primaryDiagram?.diagramType}, ` +
        `Supplementary: ${result.supplementaryDiagrams?.length || 0}`,
      );

      return result;
    } catch (error) {
      this.logger.error('Error generating diagram:', error);

      // Return a basic fallback diagram
      return {
        primaryDiagram: {
          diagramType: 'flowchart',
          title: 'Diagram Generation Error',
          description: `Failed to generate diagram: ${error.message}`,
          mermaidCode: 'graph TD\n  A[Error] --> B[Failed to Generate Diagram]',
        },
        summary: `Error: ${error.message}`,
        impactedComponents: [],
      } as DiagramGeneration;
    }
  }


  private cleanMermaidCode(code: string): string {
    let cleaned = code.trim();

    // Remove markdown code fences
    if (cleaned.startsWith('```mermaid')) {
      cleaned = cleaned.substring('```mermaid'.length);
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring('```'.length);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - '```'.length);
    }

    return cleaned.trim();
  }



  async generateMultipleDiagrams(
    diffs: Array<{
      id: string;
      diff: string;
      context?: any;
    }>,
    extraInstructions?: string,
  ): Promise<Map<string, DiagramGeneration>> {
    this.logger.log(`Starting batch diagram generation for ${diffs.length} PRs`);
    const results = new Map<string, DiagramGeneration>();

    for (const item of diffs) {
      try {
        const diagram = await this.generateDiagram(
          item.diff,
          item.context,
          extraInstructions,
        );
        results.set(item.id, diagram);
      } catch (error) {
        this.logger.error(`Failed to generate diagram for PR ${item.id}`, error);
        // Create a minimal error response
        results.set(item.id, {
          primaryDiagram: {
            diagramType: 'flowchart',
            title: 'Diagram Generation Failed',
            description: `Failed to generate diagram: ${error.message}`,
            mermaidCode: 'flowchart LR\n  Error[Diagram Generation Failed]',
          },
          summary: `Error: ${error.message}`,
          impactedComponents: [],
        });
      }
    }

    return results;
  }
}