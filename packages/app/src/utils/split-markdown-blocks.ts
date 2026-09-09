import MarkdownIt from "markdown-it";

const markdownBlockParser = new MarkdownIt();

function isEscaped(source: string, position: number): boolean {
  let backslashCount = 0;
  for (let index = position - 1; index >= 0 && source[index] === "\\"; index--) {
    backslashCount++;
  }
  return backslashCount % 2 === 1;
}

export function findUnescapedDelimiter(source: string, delimiter: string): number {
  let searchStart = 0;

  while (searchStart < source.length) {
    const delimiterStart = source.indexOf(delimiter, searchStart);
    if (delimiterStart === -1) {
      return -1;
    }
    if (!isEscaped(source, delimiterStart)) {
      return delimiterStart;
    }
    searchStart = delimiterStart + delimiter.length;
  }

  return -1;
}

function getFenceDelimiter(line: string) {
  const match = /^( {0,3})(`{3,}|~{3,})/.exec(line);
  return match?.[2] ?? null;
}

interface ProtectedBlockState {
  fenceCharacter: "`" | "~" | null;
  fenceLength: number;
}

// markdown-it only emits a fence token for a closed fence, so a fence that is still
// streaming has no token and its interior blank lines look like paragraph breaks.
function updateProtectedBlockState(line: string, state: ProtectedBlockState): void {
  const fenceDelimiter = getFenceDelimiter(line);
  if (state.fenceCharacter) {
    if (
      fenceDelimiter?.[0] === state.fenceCharacter &&
      fenceDelimiter.length >= state.fenceLength
    ) {
      state.fenceCharacter = null;
      state.fenceLength = 0;
    }
    return;
  }

  if (fenceDelimiter) {
    state.fenceCharacter = fenceDelimiter[0] as "`" | "~";
    state.fenceLength = fenceDelimiter.length;
  }
}

export function splitMarkdownBlocks(text: string): string[] {
  if (text.length === 0) {
    return [];
  }

  const blocks: string[] = [];
  let currentLines: string[] = [];
  const protectedBlockState: ProtectedBlockState = { fenceCharacter: null, fenceLength: 0 };
  let sawBlockSeparator = false;
  const lines = text.split("\n");
  const structuralBlankLines = getStructuralBlankLines(text, lines);

  for (const [index, line] of lines.entries()) {
    const isBlankLine = line.trim().length === 0;
    const isInsideProtectedBlock = protectedBlockState.fenceCharacter !== null;

    if (isBlankLine && (isInsideProtectedBlock || structuralBlankLines.has(index))) {
      currentLines.push(line);
      continue;
    }

    if (isBlankLine) {
      if (currentLines.length > 0) {
        sawBlockSeparator = true;
      }
      continue;
    }

    if (!isInsideProtectedBlock && sawBlockSeparator) {
      blocks.push(currentLines.join("\n"));
      currentLines = [];
      sawBlockSeparator = false;
    }

    currentLines.push(line);
    updateProtectedBlockState(line, protectedBlockState);
  }

  if (currentLines.length > 0) {
    blocks.push(currentLines.join("\n"));
  }

  return blocks.filter((block) => block.length > 0);
}

function getStructuralBlankLines(text: string, lines: string[]): Set<number> {
  const blankLines = new Set<number>();
  for (const token of markdownBlockParser.parse(text, {})) {
    if (token.level !== 0 || !token.map) {
      continue;
    }
    const [start, end] = token.map;
    for (let index = start; index < end - 1; index += 1) {
      if (lines[index]?.trim().length === 0) {
        blankLines.add(index);
      }
    }
  }
  return blankLines;
}
