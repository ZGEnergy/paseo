/**
 * @vitest-environment jsdom
 */
import React, { createElement } from "react";
import { render } from "@testing-library/react";
import { View } from "react-native";
import { beforeEach, describe, expect, it } from "vitest";
import { MarkdownSource } from "./markdown-source.native";

beforeEach(() => {
  (globalThis as { React?: typeof React }).React = React;
});

describe("MarkdownSource native host", () => {
  it("hosts a view child inline", () => {
    const { container } = render(
      createElement(MarkdownSource, { source: "$x$" }, createElement(View, { testID: "drawing" })),
    );
    const drawing = container.querySelector('[data-testid="drawing"]');
    expect(drawing).not.toBeNull();
    const host = drawing?.parentElement;
    expect(host?.getAttribute("aria-label")).toBe("$x$");
    // react-native-web Text sets dir="auto"; View does not. Drawn plugin
    // children (SvgXml) are views and cannot nest under native Text.
    expect(host?.hasAttribute("dir")).toBe(false);
  });
});
