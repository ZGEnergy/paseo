# Markdown extension example

The smallest plugin that uses every part of `addMarkdownExtension`. Install the directory, then
ask an agent to reply with `::badge::` or a `:::` block.

- `parser` adds two markdown-it rules: an inline `::text::` and a `:::` … `:::` block.
- `rules` render those tokens. Both draw a square with the host's `SvgXml` and hold no text, the
  case `MarkdownSource` exists for: a block that rendered its content as text would already copy
  as that text.
- `blockDelimiters` declares the `:::` pair, so the streaming splitter holds a `:::` block that
  has not closed yet in one render block instead of cutting it at the first blank line.
- `MarkdownSource` declares what each rendered token copies as, so a web drag selection returns
  the source verbatim, with no markdown escaping applied to it.

This directory ships no `package.json` and needs none: the callbacks take their `MarkdownIt` and
node types from the SDK contextually, so nothing here imports `markdown-it` or
`react-native-markdown-display`. Name either type explicitly and the plugin compiler requires the
package to resolve, even for a type-only import.
