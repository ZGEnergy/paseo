import type {
  PluginMarkdownBlockDelimiter,
  PluginMarkdownExtension,
} from "@getpaseo/plugin/client";
import type { ComponentType } from "react";
import { markdownMath } from "./markdown-math";
import type { MathFormulaProps } from "./math-formula";
import { createMathMarkdownRules } from "./math-rules";

export const MATH_BLOCK_DELIMITERS: PluginMarkdownBlockDelimiter[] = [
  { open: "$$", close: "$$" },
  { open: "\\[", close: "\\]" },
];

export function createMathExtension(
  Formula: ComponentType<MathFormulaProps>,
): PluginMarkdownExtension {
  return {
    id: "math",
    parser: markdownMath,
    rules: createMathMarkdownRules(Formula),
    blockDelimiters: MATH_BLOCK_DELIMITERS,
  };
}
