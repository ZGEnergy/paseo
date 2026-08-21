import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MathFormula } from "./math-formula.web";

const THEMED_TEXT_STYLE = { color: "rgb(250, 250, 250)" };

afterEach(cleanup);

describe("MathFormula", () => {
  it("renders an accessible KaTeX formula", () => {
    const { container } = render(
      <MathFormula expression="E = mc^2" source="$E = mc^2$" displayMode={false} />,
    );

    expect(container.querySelector(".katex-html")?.textContent).toContain("E=mc2");
    expect(container.querySelector("math")?.getAttribute("aria-hidden")).not.toBe("true");
    expect(container.querySelector("[aria-label='$E = mc^2$']")).not.toBeNull();
  });

  it("keeps inline fractions compact and structurally rendered", () => {
    const expression = String.raw`\displaystyle x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`;
    const { container } = render(
      <MathFormula expression={expression} source={`$${expression}$`} displayMode={false} />,
    );

    const formula = container.querySelector<HTMLElement>("[aria-label]");
    expect(formula?.style.fontSize).toBe("0.9em");
    expect(formula?.style.verticalAlign).toBe("baseline");
    expect(container.querySelector("math")?.getAttribute("display")).not.toBe("block");
    expect(container.querySelector("mfrac")).not.toBeNull();
    expect(container.querySelector("annotation")?.textContent).not.toContain("\\displaystyle");
    expect(container.querySelector(".frac-line")).not.toBeNull();
  });

  it("applies the themed text color to inline and display formulas", () => {
    const inline = render(
      <MathFormula
        expression="E = mc^2"
        source="$E = mc^2$"
        displayMode={false}
        textStyle={THEMED_TEXT_STYLE}
      />,
    );
    const inlineFormula = inline.container.querySelector<HTMLElement>(".katex");
    expect(inlineFormula).not.toBeNull();
    expect(getComputedStyle(inlineFormula as HTMLElement).color).toBe("rgb(250, 250, 250)");
    cleanup();

    const display = render(
      <MathFormula
        expression="E = mc^2"
        source="$$E = mc^2$$"
        displayMode
        textStyle={THEMED_TEXT_STYLE}
      />,
    );
    const displayFormula = display.container.querySelector<HTMLElement>(".katex");
    expect(displayFormula).not.toBeNull();
    expect(getComputedStyle(displayFormula as HTMLElement).color).toBe("rgb(250, 250, 250)");
  });

  it("keeps invalid LaTeX visible instead of throwing", () => {
    const { container } = render(
      <MathFormula expression="\\notacommand{" source="\\[\\notacommand{\\]" displayMode />,
    );

    expect(container.textContent).toContain("\\notacommand{");
  });
});
