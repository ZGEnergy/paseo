import React, { useMemo, type CSSProperties } from "react";
import { ParseError, renderToString } from "katex";
import "katex/dist/katex.min.css";
const DISPLAY_STYLE: CSSProperties = {
  display: "block",
  maxWidth: "100%",
  overflowX: "auto",
  overflowY: "hidden",
};
const INLINE_STYLE: CSSProperties = {
  display: "inline-block",
  maxWidth: "100%",
  verticalAlign: "middle",
};

export interface MathFormulaProps {
  expression: string;
  source: string;
  displayMode: boolean;
}

export function MathFormula({ expression, source, displayMode }: MathFormulaProps) {
  const rendered = useMemo(() => {
    try {
      const html = renderToString(expression, {
        displayMode,
        output: "htmlAndMathml",
        throwOnError: false,
        trust: false,
      });
      return { __html: html };
    } catch (error) {
      if (error instanceof ParseError) {
        return null;
      }
      throw error;
    }
  }, [displayMode, expression]);

  if (!rendered) {
    return <code>{source}</code>;
  }

  if (displayMode) {
    return (
      <span
        aria-label={source}
        style={DISPLAY_STYLE}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX emits sanitized markup with trust disabled.
        dangerouslySetInnerHTML={rendered}
      />
    );
  }

  return (
    <span
      aria-label={source}
      style={INLINE_STYLE}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX emits sanitized markup with trust disabled.
      dangerouslySetInnerHTML={rendered}
    />
  );
}
