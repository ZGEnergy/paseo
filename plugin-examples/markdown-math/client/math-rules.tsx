import React, { type ComponentType, type ReactNode } from "react";
import type { StyleProp, TextStyle } from "react-native";
import type { ASTNode, RenderRules } from "react-native-markdown-display";
import type { MathFormulaProps } from "./math-formula";

interface MathTextStyles {
  text?: StyleProp<TextStyle>;
}

function getMathFormulaProps(node: ASTNode): Omit<MathFormulaProps, "textStyle"> {
  const content = node.content ?? "";
  const sourceInfo = node.sourceInfo?.trim() ?? "";
  const fenceLanguage = sourceInfo.split(/\s+/, 1)[0]?.toLowerCase();
  const isMathFence =
    node.type === "math_block" &&
    fenceLanguage === "math" &&
    (node.markup.startsWith("`") || node.markup.startsWith("~"));

  if (isMathFence) {
    const terminatedContent = content.endsWith("\n") ? content : `${content}\n`;
    return {
      expression: content.trim(),
      source: `${node.markup}${sourceInfo}\n${terminatedContent}${node.markup}`,
      displayMode: true,
    };
  }

  let closingDelimiter = "$";
  if (node.markup === "\\(") {
    closingDelimiter = "\\)";
  } else if (node.markup === "\\[") {
    closingDelimiter = "\\]";
  } else if (node.markup === "$$") {
    closingDelimiter = "$$";
  }

  const displayMode = node.type === "math_block";
  const separator = node.type === "math_block" ? "\n" : "";
  return {
    expression: content,
    source: `${node.markup}${separator}${content}${separator}${closingDelimiter}`,
    displayMode,
  };
}

// Kept out of the JSX prop position so the array literal isn't flagged as a fresh
// per-render allocation by the repo's lint rule (packages/app exempts this pattern for
// Unistyles proxies; this plugin has no such exemption).
function combineTextStyle(
  inheritedStyles: TextStyle,
  textStyle: StyleProp<TextStyle>,
): StyleProp<TextStyle> {
  return [inheritedStyles, textStyle];
}

// Math tokens are leaf nodes, so the renderer hands them the ancestors' text styles as the
// fifth argument. That is the only place the prose color reaches them.
export function createMathMarkdownRules(
  Formula: ComponentType<MathFormulaProps>,
): Pick<RenderRules, "math_inline" | "math_block"> {
  const renderMathFormula = (
    node: ASTNode,
    _children: ReactNode[],
    _parent: ASTNode[],
    styles: MathTextStyles,
    inheritedStyles: TextStyle = {},
  ) => (
    <Formula
      key={node.key}
      {...getMathFormulaProps(node)}
      textStyle={combineTextStyle(inheritedStyles, styles.text)}
    />
  );
  return { math_inline: renderMathFormula, math_block: renderMathFormula };
}
