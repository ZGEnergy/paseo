import { describe, expect, it } from "vitest";
import { renderSvg } from "../../../../plugin-examples/markdown-math/client/math-formula";

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
