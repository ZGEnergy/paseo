import MarkdownIt from "markdown-it";
import { findUnescapedDelimiter } from "./markdown-math";

const markdownBlockParser = new MarkdownIt();

function getFenceDelimiter(line: string) {
  const match = /^( {0,3})(`{3,}|~{3,})/.exec(line);
  return match?.[2] ?? null;
}
interface DisplayMathDelimiter {
  closing: "$$" | "\\]";
  closesOnOpeningLine: boolean;
}

function stripMarkdownContainerPrefix(line: string): string {
  let remainder = line;
  let foundContainer = false;

  while (true) {
    const blockquote = /^ {0,3}>[ \t]?/.exec(remainder);
    if (blockquote) {
      remainder = remainder.slice(blockquote[0].length);
      foundContainer = true;
      continue;
    }

    const listItem = /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/.exec(remainder);
    if (listItem) {
      remainder = remainder.slice(listItem[0].length);
      foundContainer = true;
      continue;
    }

    return foundContainer ? remainder : line;
  }
}

function getDisplayMathDelimiter(line: string): DisplayMathDelimiter | null {
  const content = stripMarkdownContainerPrefix(line);
  const match = /^ {0,3}(\$\$|\\\[)/.exec(content);
  if (!match) {
    return null;
  }

  const opening = match[1];
  const closing = opening === "$$" ? "$$" : "\\]";
  const remainder = content.slice(match[0].length);
  return {
    closing,
    closesOnOpeningLine: findUnescapedDelimiter(remainder, closing) !== -1,
  };
}

interface ProtectedBlockState {
  fenceCharacter: "`" | "~" | null;
  fenceLength: number;
  displayMathClosing: DisplayMathDelimiter["closing"] | null;
}

function updateProtectedBlockState(line: string, state: ProtectedBlockState): void {
  if (state.displayMathClosing) {
    if (findUnescapedDelimiter(line, state.displayMathClosing) !== -1) {
      state.displayMathClosing = null;
    }
    return;
  }

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
    return;
  }

  const displayMathDelimiter = getDisplayMathDelimiter(line);
  if (displayMathDelimiter && !displayMathDelimiter.closesOnOpeningLine) {
    state.displayMathClosing = displayMathDelimiter.closing;
  }
}

export function splitMarkdownBlocks(text: string): string[] {
  if (text.length === 0) {
    return [];
  }

  const blocks: string[] = [];
  let currentLines: string[] = [];
  const protectedBlockState: ProtectedBlockState = {
    fenceCharacter: null,
    fenceLength: 0,
    displayMathClosing: null,
  };
  let sawBlockSeparator = false;
  const lines = text.split("\n");
  const structuralBlankLines = getStructuralBlankLines(text, lines);

  for (const [index, line] of lines.entries()) {
    const isBlankLine = line.trim().length === 0;
    const isInsideProtectedBlock =
      protectedBlockState.fenceCharacter !== null ||
      protectedBlockState.displayMathClosing !== null;

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
