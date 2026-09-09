import type MarkdownIt from "markdown-it";
import type { RenderRules } from "react-native-markdown-display";
import type { PluginMarkdownExtension } from "@getpaseo/plugin/client";
import type { MarkdownBlockDelimiter } from "@/utils/split-markdown-blocks";

interface MarkdownExtensionHost {
  markdownExtensions: PluginMarkdownExtension[];
}

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

/** Applies every extension parser to `parser` in registration order and returns it. */
export function applyMarkdownExtensionParsers(
  parser: MarkdownIt,
  extensions: readonly PluginMarkdownExtension[],
): MarkdownIt {
  for (const extension of extensions) {
    if (extension.parser) parser.use(extension.parser);
  }
  return parser;
}

/** Built-in rules first, then each extension in order, so a plugin rule wins on collision. */
export function mergeMarkdownExtensionRules(
  baseRules: RenderRules,
  extensions: readonly PluginMarkdownExtension[],
): RenderRules {
  return Object.assign({}, baseRules, ...extensions.map((extension) => extension.rules ?? {}));
}
