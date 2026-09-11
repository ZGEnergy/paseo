import type MarkdownIt from "markdown-it";
import type { RenderRules } from "react-native-markdown-display";
import type { PluginMarkdownExtension } from "@getpaseo/plugin/client";
import type { MarkdownBlockDelimiter } from "@/utils/split-markdown-blocks";

interface MarkdownExtensionHost {
  markdownExtensions: PluginMarkdownExtension[];
}

type MarkdownRenderRule = NonNullable<RenderRules[string]>;

export function collectMarkdownExtensions(
  plugins: readonly MarkdownExtensionHost[],
): PluginMarkdownExtension[] {
  return plugins.flatMap((plugin) => plugin.markdownExtensions);
}

export function collectMarkdownBlockDelimiters(
  plugins: readonly MarkdownExtensionHost[],
): MarkdownBlockDelimiter[] {
  return collectMarkdownExtensions(plugins).flatMap((extension) => extension.blockDelimiters ?? []);
}

/**
 * Applies every extension parser in registration order. A parser that throws loses only its own
 * extension, including any ruler mutations it made before throwing: this runs while rendering an
 * assistant message, so an escaping error would otherwise reach the root boundary and replace the
 * whole app.
 */
export function applyMarkdownExtensionParsers(
  createParser: () => MarkdownIt,
  extensions: readonly PluginMarkdownExtension[],
): { parser: MarkdownIt; extensions: PluginMarkdownExtension[] } {
  const applied: PluginMarkdownExtension[] = [];
  let parser = createParser();
  for (const extension of extensions) {
    if (!extension.parser) {
      applied.push(extension);
      continue;
    }
    try {
      parser.use(extension.parser);
      applied.push(extension);
    } catch (error) {
      console.warn(`[Plugins] Markdown extension ${extension.id} failed to install`, error);
      parser = createParser();
      for (const previous of applied) {
        if (previous.parser) parser.use(previous.parser);
      }
    }
  }
  return { parser, extensions: applied };
}

/** A rule that throws falls back to the previous rule rather than taking the message down with it. */
function isolateRule(
  extensionId: string,
  name: string,
  rule: MarkdownRenderRule,
  previous: MarkdownRenderRule | undefined,
) {
  return (...args: Parameters<MarkdownRenderRule>) => {
    try {
      return rule(...args);
    } catch (error) {
      console.warn(`[Plugins] Markdown rule ${extensionId}/${name} failed`, error);
      return previous ? previous(...args) : null;
    }
  };
}

/** Built-in rules first, then each extension in order, so a plugin rule wins on collision. */
export function mergeMarkdownExtensionRules(
  baseRules: RenderRules,
  extensions: readonly PluginMarkdownExtension[],
): RenderRules {
  const merged: RenderRules = { ...baseRules };
  for (const extension of extensions) {
    for (const [name, rule] of Object.entries(extension.rules ?? {})) {
      if (rule) {
        const previous = merged[name];
        merged[name] = isolateRule(extension.id, name, rule, previous);
      }
    }
  }
  return merged;
}
