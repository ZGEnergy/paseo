import React, { type ReactNode } from "react";
import type { TextStyle } from "react-native";
import type { ASTNode, RenderRules } from "react-native-markdown-display";
import { MathFormula, type MathFormulaProps } from "@/components/math-formula";
import type { MarkdownStyles } from "@/components/markdown/renderer";

function getMathFormulaProps(node: ASTNode): MathFormulaProps {
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

// Math tokens are leaf nodes, so the renderer hands them the ancestors' text styles as the fifth
// argument. That is the only place the prose color reaches them: markdown `text` carries no color.
const renderMathFormula = (
  node: ASTNode,
  _children: ReactNode[],
  _parent: ASTNode[],
  styles: MarkdownStyles,
  inheritedStyles: TextStyle = {},
) => (
  <MathFormula
    key={node.key}
    {...getMathFormulaProps(node)}
    textStyle={[inheritedStyles, styles.text]}
  />
);

export const mathMarkdownRules: Pick<RenderRules, "math_inline" | "math_block"> = {
  math_inline: renderMathFormula,
  math_block: renderMathFormula,
};
