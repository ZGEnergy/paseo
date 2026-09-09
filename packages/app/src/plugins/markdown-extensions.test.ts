import MarkdownIt from "markdown-it";
import type { PluginMarkdownExtension } from "@getpaseo/plugin/client";
import { describe, expect, it } from "vitest";
import {
  applyMarkdownExtensionParsers,
  collectMarkdownBlockDelimiters,
  collectMarkdownExtensions,
  mergeMarkdownExtensionRules,
} from "./markdown-extensions";

const shout: PluginMarkdownExtension = {
  id: "shout",
  parser: (markdown) => {
    markdown.core.ruler.push("shout", (state) => {
      for (const token of state.tokens) {
        if (token.type === "inline") token.content = token.content.toUpperCase();
      }
    });
  },
  rules: { paragraph: () => null },
  blockDelimiters: [{ open: "$$", close: "$$" }],
};

const quiet: PluginMarkdownExtension = {
  id: "quiet",
  rules: { paragraph: () => "quiet", heading1: () => "h1" },
};

describe("collectMarkdownExtensions", () => {
  it("flattens extensions across installed plugins in order", () => {
    const plugins = [{ markdownExtensions: [shout] }, { markdownExtensions: [quiet] }];
    expect(collectMarkdownExtensions(plugins)).toEqual([shout, quiet]);
  });

  it("flattens declared block delimiters and skips extensions without any", () => {
    const plugins = [{ markdownExtensions: [shout, quiet] }];
    expect(collectMarkdownBlockDelimiters(plugins)).toEqual([{ open: "$$", close: "$$" }]);
  });
});

describe("applyMarkdownExtensionParsers", () => {
  it("applies each parser to the same instance and returns it", () => {
    const parser = new MarkdownIt();
    const result = applyMarkdownExtensionParsers(parser, [shout, quiet]);
    expect(result).toBe(parser);
    const inline = parser.parse("hello", {}).find((token) => token.type === "inline");
    expect(inline?.content).toBe("HELLO");
  });
});

describe("mergeMarkdownExtensionRules", () => {
  it("spreads extension rules after the base so a later extension wins", () => {
    const base = { paragraph: () => "base", text: () => "text" };
    const merged = mergeMarkdownExtensionRules(base, [shout, quiet]);
    expect(merged.paragraph).toBe(quiet.rules?.paragraph);
    expect(merged.heading1).toBe(quiet.rules?.heading1);
    expect(merged.text).toBe(base.text);
  });

  it("returns a new object and leaves the base untouched", () => {
    const base = { text: () => "text" };
    const merged = mergeMarkdownExtensionRules(base, [quiet]);
    expect(merged).not.toBe(base);
    expect(Object.keys(base)).toEqual(["text"]);
  });
});
