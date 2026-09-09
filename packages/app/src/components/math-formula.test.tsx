/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// SvgXml and MarkdownSource are declare-only in the SDK (the real implementations live in the
// host's plugin sandbox, wired in at plugin-evaluation time); mock them here, scoped to this
// file, so the real MathFormula component can render under vitest instead of needing the host's
// sandbox. The SvgXml mock captures exactly what MathFormula computed and handed it — the thing
// under test — instead of drawing anything.
const { svgXmlMock } = vi.hoisted(() => ({
  svgXmlMock: vi.fn((_props: { xml: string | null; width?: number; height?: number }) => null),
}));

vi.mock("@getpaseo/plugin/client/react-native", () => ({
  SvgXml: (props: { xml: string | null; width?: number; height?: number }) => svgXmlMock(props),
  MarkdownSource: ({ children }: { children: ReactNode }) => children,
}));

import {
  EX_PER_FONT_SIZE,
  MathFormula,
  renderSvg,
} from "../../../../plugin-examples/markdown-math/client/math-formula";

const LARGE_FONT_STYLE = { fontSize: 32 };

afterEach(() => {
  cleanup();
  svgXmlMock.mockClear();
});

describe("renderSvg", () => {
  it("produces a well-formed, colorable SVG box for a valid expression", () => {
    const rendered = renderSvg("E = mc^2", false);

    expect(rendered).not.toBeNull();
    expect(rendered?.xml).toContain("<svg");
    expect(rendered?.xml).toContain("currentColor");
    expect(rendered?.widthEx).toBeGreaterThan(0);
    expect(rendered?.heightEx).toBeGreaterThan(0);
  });

  it("captures MathJax's baseline offset in ex units", () => {
    const rendered = renderSvg("x_1", false);

    // A descender like the subscript here always lowers the box below the baseline.
    expect(rendered?.verticalAlignEx).toBeLessThan(0);
  });

  it("strips a leading \\displaystyle for inline math so it renders at the compact size", () => {
    const strippedInline = renderSvg("\\displaystyle \\frac{a}{b}", false);
    const plainInline = renderSvg("\\frac{a}{b}", false);
    const fullDisplay = renderSvg("\\frac{a}{b}", true);

    expect(strippedInline?.heightEx).toBe(plainInline?.heightEx);
    expect(strippedInline?.heightEx).toBeLessThan(fullDisplay?.heightEx ?? 0);
  });

  it("leaves \\displaystyle alone in display mode", () => {
    const withDisplayStyle = renderSvg("\\displaystyle \\frac{a}{b}", true);
    const fullDisplay = renderSvg("\\frac{a}{b}", true);

    expect(withDisplayStyle?.heightEx).toBe(fullDisplay?.heightEx);
  });

  it("returns null when MathJax cannot typeset the expression, so the caller falls back to raw source text", () => {
    // Deep enough nesting reliably overflows the TeX parser's call stack well below this depth.
    const runawayNesting = "\\frac{a}{".repeat(5000) + "b" + "}".repeat(5000);

    expect(renderSvg(runawayNesting, false)).toBeNull();
  });
});

describe("MathFormula", () => {
  it("converts MathJax's ex-sized box into pixels using the formula's font size", () => {
    const expression = "E = mc^2";
    const expected = renderSvg(expression, false);
    expect(expected).not.toBeNull();

    render(
      <MathFormula
        expression={expression}
        source="$E = mc^2$"
        displayMode={false}
        textStyle={LARGE_FONT_STYLE}
      />,
    );

    expect(svgXmlMock).toHaveBeenCalledTimes(1);
    const props = svgXmlMock.mock.calls[0]?.[0];
    const fontSize = LARGE_FONT_STYLE.fontSize;
    expect(props?.width).toBe((expected?.widthEx ?? 0) * fontSize * EX_PER_FONT_SIZE);
    expect(props?.height).toBe((expected?.heightEx ?? 0) * fontSize * EX_PER_FONT_SIZE);
  });

  it("uses the default font size when no textStyle font size is given", () => {
    const expression = "x_1";
    const expected = renderSvg(expression, false);
    expect(expected).not.toBeNull();

    render(<MathFormula expression={expression} source="$x_1$" displayMode={false} />);

    const props = svgXmlMock.mock.calls[0]?.[0];
    const defaultFontSize = 16;
    expect(props?.width).toBe((expected?.widthEx ?? 0) * defaultFontSize * EX_PER_FONT_SIZE);
  });

  it("renders the raw source text instead of a formula when MathJax cannot typeset the expression", () => {
    // The same runaway nesting renderSvg's own test uses to force a real typeset failure.
    const runawayNesting = "\\frac{a}{".repeat(5000) + "b" + "}".repeat(5000);
    const source = "$\\frac{a}{\\frac{a}{\\dots}}$";

    const { container } = render(
      <MathFormula expression={runawayNesting} source={source} displayMode={false} />,
    );

    expect(svgXmlMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain(source);
  });
});

// The deleted KaTeX path (packages/app/src/components/math-formula.web.tsx, pre-plugin) carried
// aria-label={source} on the element it rendered, on both the inline and display branches. SvgXml
// draws glyph paths with no text content, so without an explicit accessible name a screen reader
// has nothing to announce for a rendered formula. These tests render the real MathFormula (only
// SvgXml/MarkdownSource are mocked, not `react-native`/`react-native-web`), so the accessible name
// asserted here is the one that actually reaches the DOM via react-native-web's
// accessibilityLabel -> aria-label mapping.
describe("MathFormula accessibility", () => {
  it("gives the inline formula an accessible name equal to its LaTeX source", () => {
    const source = "$E = mc^2$";
    const { getByRole } = render(
      <MathFormula expression="E = mc^2" source={source} displayMode={false} />,
    );

    expect(getByRole("img", { name: source })).toBeTruthy();
  });

  it("gives the display formula an accessible name equal to its LaTeX source", () => {
    const source = "$$\\int_0^1 x^2 dx$$";
    const { getByRole } = render(
      <MathFormula expression="\\int_0^1 x^2 dx" source={source} displayMode={true} />,
    );

    expect(getByRole("img", { name: source })).toBeTruthy();
  });
});
