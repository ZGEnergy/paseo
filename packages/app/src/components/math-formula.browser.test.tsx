import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MathFormula } from "./math-formula.web";

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

  it("keeps invalid LaTeX visible instead of throwing", () => {
    const { container } = render(
      <MathFormula expression="\\notacommand{" source="\\[\\notacommand{\\]" displayMode />,
    );

    expect(container.textContent).toContain("\\notacommand{");
  });
});
