export interface DiffLineMapping {
  oldLine: number | null;
  newLine: number | null;
  content: string;
  type: 'added' | 'deleted' | 'unchanged' | 'header';
}

export class DiffParser {
  /**
   * Formats a diff with line numbers for the new file
   * Similar to CodeReviewHelper.formatDiffWithNewLineNumbers
   * @param diff - Raw diff string
   * @returns Formatted diff with line numbers
   */
  static formatDiffWithLineNumbers(diff: string): string {
    const diffLines = diff.split('\n');
    let oldLineOffset = 0;
    let newLineOffset = 0;
    let oldLineStart = 0;
    let newLineStart = 0;
    const formattedDiff: string[] = [];

    diffLines.forEach((line) => {
      // Check for diff header (@@ -10,7 +10,8 @@)
      const headerMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);

      if (headerMatch) {
        // Extract starting line numbers from the diff header
        oldLineStart = parseInt(headerMatch[1], 10);
        newLineStart = parseInt(headerMatch[2], 10);
        oldLineOffset = oldLineStart - 1;
        newLineOffset = newLineStart - 1;
        // Append header line without line number
        formattedDiff.push(`    : ${line}`);
      } else if (line.startsWith('diff --git')) {
        // File header
        formattedDiff.push(`    : ${line}`);
      } else if (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
        // Git metadata
        formattedDiff.push(`    : ${line}`);
      } else if (line.startsWith('-')) {
        // Lines that were removed (exist only in the old file)
        oldLineOffset++;
        formattedDiff.push(`    : ${line}`);
      } else if (line.startsWith('+')) {
        // Lines that were added (exist only in the new file)
        newLineOffset++;
        formattedDiff.push(`${newLineOffset.toString().padStart(4, ' ')}: ${line}`);
      } else if (!line.startsWith('\\')) {
        // Lines that are unchanged (exist in both files)
        oldLineOffset++;
        newLineOffset++;
        formattedDiff.push(`${newLineOffset.toString().padStart(4, ' ')}: ${line}`);
      } else {
        // Special lines like "\ No newline at end of file"
        formattedDiff.push(`    : ${line}`);
      }
    });

    return formattedDiff.join('\n');
  }

  /**
   * Creates a mapping between old and new line numbers
   * @param diff - Raw diff string
   * @returns Array of line mappings
   */
  static mapDiffLines(diff: string): DiffLineMapping[] {
    const lines = diff.split('\n');
    let oldLineNumber: number | null = null;
    let newLineNumber: number | null = null;
    const lineMap: DiffLineMapping[] = [];

    for (const line of lines) {
      if (line.startsWith('@@')) {
        // Parse the line number information
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLineNumber = parseInt(match[1], 10);
          newLineNumber = parseInt(match[2], 10);
        }
        lineMap.push({
          oldLine: null,
          newLine: null,
          content: line,
          type: 'header',
        });
      } else if (line.startsWith('+')) {
        // Line added in new file
        lineMap.push({
          oldLine: null,
          newLine: newLineNumber,
          content: line,
          type: 'added',
        });
        if (newLineNumber !== null) newLineNumber++;
      } else if (line.startsWith('-')) {
        // Line removed from old file
        lineMap.push({
          oldLine: oldLineNumber,
          newLine: null,
          content: line,
          type: 'deleted',
        });
        if (oldLineNumber !== null) oldLineNumber++;
      } else if (!line.startsWith('\\') && !line.startsWith('diff ') && !line.startsWith('index ') && !line.startsWith('---') && !line.startsWith('+++')) {
        // Line unchanged in both files
        lineMap.push({
          oldLine: oldLineNumber,
          newLine: newLineNumber,
          content: line,
          type: 'unchanged',
        });
        if (oldLineNumber !== null) oldLineNumber++;
        if (newLineNumber !== null) newLineNumber++;
      }
    }

    return lineMap;
  }

  /**
   * Finds the corresponding old line for a new line number (needed for GitLab)
   * @param lineMap - Line mapping array
   * @param newLine - Line number in the new file
   * @returns Corresponding line number in the old file, or null
   */
  static findOldLineForNewLine(lineMap: DiffLineMapping[], newLine: number): number | null {
    const mapping = lineMap.find(m => m.newLine === newLine);
    return mapping?.oldLine || null;
  }

  /**
   * Validates if a line number exists in the changed sections of a diff
   * @param lineMap - Line mapping array
   * @param lineNumber - Line number to validate
   * @returns True if the line is in a changed section
   */
  static isLineInChangedSection(lineMap: DiffLineMapping[], lineNumber: number): boolean {
    const mapping = lineMap.find(m => m.newLine === lineNumber);
    if (!mapping) return false;

    // Line is in changed section if it's added or if there's context around changes
    // We should check if the line is within a reasonable distance of actual changes
    const nearbyChanges = lineMap.filter(m => {
      if (!m.newLine || (m.type !== 'added' && m.type !== 'deleted')) return false;
      const distance = Math.abs((m.newLine || 0) - lineNumber);
      return distance <= 3; // Within 3 lines of a change
    });

    return mapping.type === 'added' || nearbyChanges.length > 0;
  }

  /**
   * Extracts file path from diff header
   * @param diffSection - A section of diff starting with "diff --git"
   * @returns File path
   */
  static extractFilePath(diffSection: string): string | null {
    const match = diffSection.match(/diff --git a\/(.*?) b\//);
    return match ? match[1] : null;
  }

  /**
   * Splits a multi-file diff into individual file diffs
   * @param diff - Raw diff string containing multiple files
   * @returns Map of file paths to their diffs
   */
  static splitMultiFileDiff(diff: string): Map<string, string> {
    const fileDiffs = new Map<string, string>();
    const lines = diff.split('\n');
    let currentFile: string | null = null;
    let currentDiff: string[] = [];

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        // Save previous file diff
        if (currentFile && currentDiff.length > 0) {
          fileDiffs.set(currentFile, currentDiff.join('\n'));
        }

        // Start new file
        currentFile = this.extractFilePath(line);
        currentDiff = [line];
      } else if (currentFile) {
        currentDiff.push(line);
      }
    }

    // Save last file diff
    if (currentFile && currentDiff.length > 0) {
      fileDiffs.set(currentFile, currentDiff.join('\n'));
    }

    return fileDiffs;
  }
}