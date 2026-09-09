import {
  createElement,
  Fragment,
  isValidElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import AstRenderer from "react-native-markdown-display/src/lib/AstRenderer";
import parser from "react-native-markdown-display/src/lib/parser";
import { describe, expect, it } from "vitest";
import { createMathExtension } from "../../../../../plugin-examples/markdown-math/client/extension";
import type { MathFormulaProps } from "../../../../../plugin-examples/markdown-math/client/math-formula";
import {
  applyMarkdownExtensionParsers,
  mergeMarkdownExtensionRules,
} from "@/plugins/markdown-extensions";
import { createAssistantMarkdownParser } from "@/utils/assistant-markdown-parser";
import { createMarkdownStyles } from "@/styles/markdown-styles";
import { darkTheme, lightTheme, type Theme } from "@/styles/theme";

// The real component pulls in MathJax; the wiring under test is parser + rules + styles.
const StubFormula: ComponentType<MathFormulaProps> = () => null;
const extension = createMathExtension(StubFormula);

function collectFormulaColors(markdown: string, theme: Theme = darkTheme): (string | undefined)[] {
  const styles = createMarkdownStyles(theme);
  const passThrough = (node: { key: string }, children: ReactNode[]) =>
    createElement(Fragment, { key: node.key }, children);
  const rules = mergeMarkdownExtensionRules(
    {
      body: passThrough,
      paragraph: passThrough,
      textgroup: passThrough,
      blockquote: passThrough,
      text: () => null,
    },
    [extension],
  );
  const renderer = new AstRenderer(rules, styles);
  const markdownIt = applyMarkdownExtensionParsers(createAssistantMarkdownParser(), [extension]);
  const tree = parser(markdown, renderer.render, markdownIt);

  const colors: (string | undefined)[] = [];
  const walk = (node: ReactNode) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!isValidElement(node)) {
      return;
    }
    const element = node as ReactElement<{
      textStyle?: StyleProp<TextStyle>;
      children?: ReactNode;
    }>;
    if (element.type === StubFormula) {
      colors.push(StyleSheet.flatten(element.props.textStyle)?.color as string | undefined);
      return;
    }
    walk(element.props.children);
  };
  walk(tree);
  return colors;
}

const colorOf = (style: StyleProp<TextStyle>) => StyleSheet.flatten(style)?.color;

describe.each<[string, Theme]>([
  ["dark", darkTheme],
  ["light", lightTheme],
])("markdown-math extension through the host (%s theme)", (_name, theme) => {
  it("gives formulas the same color as the prose around them", () => {
    const styles = createMarkdownStyles(theme);
    const colors = collectFormulaColors("Inline $E = mc^2$ and display:\n\n$$E = mc^2$$\n", theme);

    expect(colors).toEqual([colorOf(styles.body), colorOf(styles.body)]);
  });

  it("follows a blockquote's color override when nested in one", () => {
    const styles = createMarkdownStyles(theme);
    const colors = collectFormulaColors("> $E = mc^2$\n", theme);

    expect(colors).toEqual([colorOf(styles.blockquote) ?? colorOf(styles.body)]);
  });
});

describe("markdown-math extension through the host", () => {
  it("uses a different color in each theme, so formulas stay legible on either background", () => {
    const dark = collectFormulaColors("$E = mc^2$\n", darkTheme);
    const light = collectFormulaColors("$E = mc^2$\n", lightTheme);

    expect(dark[0]).toBe(darkTheme.colors.foreground);
    expect(light[0]).toBe(lightTheme.colors.foreground);
    expect(dark[0]).not.toBe(light[0]);
  });

  it("declares the display delimiters the splitter protects", () => {
    expect(extension.blockDelimiters).toEqual([
      { open: "$$", close: "$$" },
      { open: "\\[", close: "\\]" },
    ]);
  });
});
