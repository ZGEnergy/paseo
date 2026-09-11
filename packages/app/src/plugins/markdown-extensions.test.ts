import MarkdownIt from "markdown-it";
import type { PluginMarkdownExtension } from "@getpaseo/plugin/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      // markdown-it ignores a core rule's return value; the v10 types require one anyway.
      return true;
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
    const call = (rule: (typeof merged)[string]) =>
      rule?.({} as never, [], [], {} as never, {} as never);
    // Plugin rules come back wrapped, so compare what they render rather than identity.
    expect(call(merged.paragraph)).toBe("quiet");
    expect(call(merged.heading1)).toBe("h1");
    expect(merged.text).toBe(base.text);
  });

  it("returns a new object and leaves the base untouched", () => {
    const base = { text: () => "text" };
    const merged = mergeMarkdownExtensionRules(base, [quiet]);
    expect(merged).not.toBe(base);
    expect(Object.keys(base)).toEqual(["text"]);
  });
});

describe("isolating a failing extension", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Both run while an assistant message renders, so an escaping error reaches the root boundary
  // and replaces the whole app. Every other kind of plugin contribution is already wrapped.
  it("keeps a throwing parser from escaping, and still applies the others", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken: PluginMarkdownExtension = {
      id: "broken",
      parser: () => {
        throw new Error("boom");
      },
    };

    const applied: string[] = [];
    const healthy: PluginMarkdownExtension = {
      id: "healthy",
      parser: () => {
        applied.push("healthy");
      },
    };

    applyMarkdownExtensionParsers(new MarkdownIt(), [broken, healthy]);

    expect(applied).toEqual(["healthy"]);
    expect(warn).toHaveBeenCalledWith(
      "[Plugins] Markdown extension broken failed to install",
      expect.any(Error),
    );
  });

  it("renders nothing for a rule that throws instead of failing the message", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken: PluginMarkdownExtension = {
      id: "broken",
      rules: {
        paragraph: () => {
          throw new Error("boom");
        },
      },
    };

    const rules = mergeMarkdownExtensionRules({}, [broken]);

    expect(rules.paragraph?.({} as never, [], [], {} as never, {} as never)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "[Plugins] Markdown rule broken/paragraph failed",
      expect.any(Error),
    );
  });
});
