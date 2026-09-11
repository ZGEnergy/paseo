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
 * Applies every extension parser to `parser` in registration order and returns it. A parser that
 * throws loses only its own extension: this runs while rendering an assistant message, so an
 * escaping error would otherwise reach the root boundary and replace the whole app.
 */
export function applyMarkdownExtensionParsers(
  parser: MarkdownIt,
  extensions: readonly PluginMarkdownExtension[],
): MarkdownIt {
  for (const extension of extensions) {
    if (!extension.parser) continue;
    try {
      parser.use(extension.parser);
    } catch (error) {
      console.warn(`[Plugins] Markdown extension ${extension.id} failed to install`, error);
    }
  }
  return parser;
}

/** A rule that throws renders nothing rather than taking the message down with it. */
function isolateRule(extensionId: string, name: string, rule: MarkdownRenderRule) {
  return (...args: Parameters<MarkdownRenderRule>) => {
    try {
      return rule(...args);
    } catch (error) {
      console.warn(`[Plugins] Markdown rule ${extensionId}/${name} failed`, error);
      return null;
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
      if (rule) merged[name] = isolateRule(extension.id, name, rule);
    }
  }
  return merged;
}
