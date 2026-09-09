# Markdown math example

This plugin renders LaTeX in assistant messages on every client. Install the directory as
`markdown-math`, then ask an agent for a formula. `index.client.tsx` registers one markdown
extension from `client/extension.ts`: the markdown-it rules in `client/markdown-math.ts` tokenize
`$…$`, `\(…\)`, `$$…$$`, `\[…\]`, and fenced `math` code blocks; `client/math-rules.tsx` renders
those tokens with `client/math-formula.tsx`, which typesets through MathJax to SVG and draws it
with the host's `SvgXml`. The extension also declares `$$` and `\[` as block delimiters so a
formula that is still streaming is never split across render blocks.

Copy is unchanged: the turn copy button writes the raw markdown. A web drag selection copies the
formula's LaTeX because `MathFormula` wraps its SVG in the host's `MarkdownSource`.

This directory ships no `package.json`. Installing it from inside this checkout works because the
plugin compiler resolves `markdown-it`, `mathjax-full`, and `react-native-markdown-display` through
the repo root's `node_modules`. Copying the directory somewhere else and installing it from there
fails to compile.

Measured on this checkout: client bundle 1623730 bytes minified; MathJax SVG emits
`currentColor` = true.
