import { MarkdownSource, SvgXml } from "@getpaseo/plugin/client/react-native";
import React, { useMemo } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
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

interface RenderedSvg {
  xml: string;
  widthEx: number;
  heightEx: number;
}

function renderSvg(expression: string, displayMode: boolean): RenderedSvg | null {
  try {
    const container = typesetter.convert(expression, { display: displayMode });
    const svg = adaptor.firstChild(container);
    // `firstChild` returns the LiteElement | LiteText union; the other adaptor calls below
    // take only LiteElement, so narrow on the property LiteText lacks.
    if (!svg || !("attributes" in svg)) return null;
    const widthEx = Number.parseFloat(adaptor.getAttribute(svg, "width"));
    const heightEx = Number.parseFloat(adaptor.getAttribute(svg, "height"));
    if (!Number.isFinite(widthEx) || !Number.isFinite(heightEx)) return null;
    let xml = adaptor.outerHTML(svg);
    if (!xml.includes("currentColor")) {
      xml = xml.replace("<svg", '<svg fill="currentColor" stroke="currentColor"');
    }
    return { xml, widthEx, heightEx };
  } catch {
    return null;
  }
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
  return (
    <MarkdownSource
      source={source}
      display={displayMode}
      style={displayMode ? styles.display : undefined}
    >
      <SvgXml xml={rendered.xml} width={width} height={height} color={color} />
    </MarkdownSource>
  );
}

const styles = StyleSheet.create({
  display: { alignItems: "center", marginVertical: 8 },
});
