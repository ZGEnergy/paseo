import { MarkdownSource, SvgXml } from "@getpaseo/plugin/client/react-native";
import React, { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";

export interface MathFormulaProps {
  expression: string;
  source: string;
  displayMode: boolean;
  textStyle?: StyleProp<TextStyle>;
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
// ponytail: base + ams only; switch to AllPackages when a user hits an unsupported macro.
const typesetter = mathjax.document("", {
  InputJax: new TeX({ packages: ["base", "ams", "newcommand", "noundefined"] }),
  // No glyph cache: every path is inline, so the SVG has no <defs>/<use> for the native
  // renderer to resolve.
  OutputJax: new SVG({ fontCache: "none" }),
});

// MathJax sizes its SVG in ex; one ex is about half the font size.
const EX_PER_FONT_SIZE = 0.5;
const DEFAULT_FONT_SIZE = 16;

export interface RenderedSvg {
  xml: string;
  widthEx: number;
  heightEx: number;
  /** MathJax's CSS `vertical-align`, in ex, relative to the surrounding text baseline. */
  verticalAlignEx: number;
}

// A bare $...$ formula renders at text size, but agents sometimes write \displaystyle inside
// inline math anyway. Left alone that renders at full display size and blows up the line height,
// so strip it for inline formulas the same way the deleted KaTeX path did.
function stripDisplayStyle(expression: string, displayMode: boolean): string {
  return displayMode ? expression : expression.replace(/^\\displaystyle\s*/, "");
}

function parseVerticalAlignEx(style: string): number {
  const match = /vertical-align:\s*(-?[\d.]+)ex/.exec(style);
  return match ? Number.parseFloat(match[1]) : 0;
}

export function renderSvg(expression: string, displayMode: boolean): RenderedSvg | null {
  try {
    const compactExpression = stripDisplayStyle(expression, displayMode);
    const container = typesetter.convert(compactExpression, { display: displayMode });
    const svg = adaptor.firstChild(container);
    // `firstChild` returns the LiteElement | LiteText union; the other adaptor calls below
    // take only LiteElement, so narrow on the property LiteText lacks.
    if (!svg || !("attributes" in svg)) return null;
    const widthEx = Number.parseFloat(adaptor.getAttribute(svg, "width"));
    const heightEx = Number.parseFloat(adaptor.getAttribute(svg, "height"));
    if (!Number.isFinite(widthEx) || !Number.isFinite(heightEx)) return null;
    const verticalAlignEx = parseVerticalAlignEx(adaptor.getAttribute(svg, "style") ?? "");
    let xml = adaptor.outerHTML(svg);
    if (!xml.includes("currentColor")) {
      xml = xml.replace("<svg", '<svg fill="currentColor" stroke="currentColor"');
    }
    return { xml, widthEx, heightEx, verticalAlignEx };
  } catch {
    // Pathological input (e.g. runaway macro recursion) can overflow the parser's call stack;
    // fall back to showing the raw source rather than crashing the message.
    return null;
  }
}

// Kept out of the JSX prop position so the object literal isn't flagged as a fresh per-render
// allocation by the repo's lint rule.
function offsetStyle(top: number): StyleProp<ViewStyle> {
  return { top };
}

export function MathFormula({ expression, source, displayMode, textStyle }: MathFormulaProps) {
  const flat = StyleSheet.flatten(textStyle) ?? {};
  const fontSize = typeof flat.fontSize === "number" ? flat.fontSize : DEFAULT_FONT_SIZE;
  const color = typeof flat.color === "string" ? flat.color : undefined;
  const rendered = useMemo(() => renderSvg(expression, displayMode), [expression, displayMode]);

  if (!rendered) {
    return <Text style={textStyle}>{source}</Text>;
  }

  const width = rendered.widthEx * fontSize * EX_PER_FONT_SIZE;
  const height = rendered.heightEx * fontSize * EX_PER_FONT_SIZE;
  const formula = <SvgXml xml={rendered.xml} width={width} height={height} color={color} />;

  if (displayMode) {
    return (
      <MarkdownSource source={source} display style={styles.display}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {formula}
        </ScrollView>
      </MarkdownSource>
    );
  }

  // react-native-svg doesn't apply CSS vertical-align, and SvgXml's width/height props already
  // fix the glyph box, so nudge the box with a relative "top" offset instead. CSS vertical-align
  // is positive-up, RN's "top" is positive-down, hence the negation.
  const baselineOffsetPx = -rendered.verticalAlignEx * fontSize * EX_PER_FONT_SIZE;
  return (
    <MarkdownSource source={source}>
      <View style={offsetStyle(baselineOffsetPx)}>{formula}</View>
    </MarkdownSource>
  );
}

const styles = StyleSheet.create({
  display: { marginVertical: 8 },
  scroll: { maxWidth: "100%" },
  scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
});
