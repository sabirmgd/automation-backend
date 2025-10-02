import { DiffLineMapping } from './diff-parser.util';
import { Logger } from '@nestjs/common';

export class LineValidator {
  private static readonly logger = new Logger(LineValidator.name);

  /**
   * Finds the nearest valid line to comment on if the exact line is invalid
   * @param lineMap - Line mapping from diff
   * @param requestedLine - The line number requested
   * @param maxDistance - Maximum distance to search (default 5 lines)
   * @returns The best alternative line number, or null if none found
   */
  static findNearestValidLine(
    lineMap: DiffLineMapping[],
    requestedLine: number,
    maxDistance: number = 5,
  ): number | null {
    // First check if the exact line exists
    const exactMatch = lineMap.find(m => m.newLine === requestedLine);
    if (exactMatch && exactMatch.type !== 'deleted') {
      return requestedLine;
    }

    // Find lines that are actually in the diff (added or context around changes)
    const validLines = lineMap
      .filter(m => m.newLine !== null && (m.type === 'added' || m.type === 'unchanged'))
      .map(m => m.newLine!)
      .sort((a, b) => a - b);

    if (validLines.length === 0) {
      this.logger.warn('No valid lines found in diff');
      return null;
    }

    // Find the closest valid line within maxDistance
    let bestLine: number | null = null;
    let bestDistance = maxDistance + 1;

    for (const validLine of validLines) {
      const distance = Math.abs(validLine - requestedLine);
      if (distance <= maxDistance && distance < bestDistance) {
        bestLine = validLine;
        bestDistance = distance;
      }
    }

    if (bestLine) {
      this.logger.debug(
        `Found alternative line ${bestLine} (distance: ${bestDistance}) for requested line ${requestedLine}`
      );
    } else {
      this.logger.warn(
        `No valid line found within ${maxDistance} lines of ${requestedLine}`
      );
    }

    return bestLine;
  }

  /**
   * Validates and corrects a line range to ensure it's within valid bounds
   * @param lineMap - Line mapping from diff
   * @param startLine - Start line of the range
   * @param endLine - End line of the range
   * @returns Corrected line range or null if invalid
   */
  static validateLineRange(
    lineMap: DiffLineMapping[],
    startLine: number,
    endLine?: number,
  ): { startLine: number; endLine: number } | null {
    // Find nearest valid start line
    const validStart = this.findNearestValidLine(lineMap, startLine);
    if (!validStart) {
      return null;
    }

    // If no end line, return single line
    if (!endLine || endLine === startLine) {
      return { startLine: validStart, endLine: validStart };
    }

    // Find nearest valid end line
    const validEnd = this.findNearestValidLine(lineMap, endLine);
    if (!validEnd) {
      // If end line is invalid, use start line as both start and end
      return { startLine: validStart, endLine: validStart };
    }

    // Ensure start is before end
    if (validStart > validEnd) {
      return { startLine: validEnd, endLine: validStart };
    }

    return { startLine: validStart, endLine: validEnd };
  }

  /**
   * Checks if a line is in a meaningful context for commenting
   * @param lineMap - Line mapping from diff
   * @param lineNumber - The line number to check
   * @returns True if the line is in a good context for commenting
   */
  static isInCommentableContext(
    lineMap: DiffLineMapping[],
    lineNumber: number,
  ): boolean {
    const line = lineMap.find(m => m.newLine === lineNumber);
    if (!line) {
      return false;
    }

    // Can't comment on deleted lines
    if (line.type === 'deleted') {
      return false;
    }

    // Added lines are always commentable
    if (line.type === 'added') {
      return true;
    }

    // For unchanged lines, check if they're near actual changes
    if (line.type === 'unchanged') {
      // Check if there are changes within 3 lines
      const nearbyChanges = lineMap.filter(m => {
        if (!m.newLine || m.type === 'unchanged') return false;
        const distance = Math.abs(m.newLine - lineNumber);
        return distance <= 3;
      });

      return nearbyChanges.length > 0;
    }

    return false;
  }

  /**
   * Suggests the best line to comment on for a given issue
   * @param lineMap - Line mapping from diff
   * @param requestedLine - The originally requested line
   * @param severity - The severity of the issue (affects search distance)
   * @returns The best line number to use for the comment
   */
  static suggestBestCommentLine(
    lineMap: DiffLineMapping[],
    requestedLine: number,
    severity: 'critical' | 'major' | 'minor' | 'info' = 'minor',
  ): number | null {
    // Critical issues should be placed as close as possible
    // Minor issues can be placed further away
    const maxDistance = severity === 'critical' ? 3 :
                        severity === 'major' ? 5 :
                        severity === 'minor' ? 7 : 10;

    // First try to find the exact line
    if (this.isInCommentableContext(lineMap, requestedLine)) {
      return requestedLine;
    }

    // Try to find the nearest valid line
    const nearestLine = this.findNearestValidLine(lineMap, requestedLine, maxDistance);
    if (nearestLine && this.isInCommentableContext(lineMap, nearestLine)) {
      this.logger.log(
        `Using line ${nearestLine} instead of ${requestedLine} for ${severity} issue`
      );
      return nearestLine;
    }

    // As a last resort for critical issues, find ANY added line in the file
    if (severity === 'critical') {
      const anyAddedLine = lineMap.find(m => m.type === 'added' && m.newLine !== null);
      if (anyAddedLine?.newLine) {
        this.logger.warn(
          `Critical issue: Using any added line ${anyAddedLine.newLine} for line ${requestedLine}`
        );
        return anyAddedLine.newLine;
      }
    }

    return null;
  }
}