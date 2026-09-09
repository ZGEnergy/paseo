# Markdown extension SDK

## Goal

Let a client plugin extend how Paseo parses, splits, and renders assistant markdown, and give it
one vector-drawing primitive, so LaTeX rendering ships as a plugin that runs inside upstream's
published iOS and Android apps. Develop and verify on this fork first, with the fork as the SDK's
first consumer, then propose the same commits upstream. The upstream PR is two additive SDK
capabilities, about 200 lines of host and SDK code across two commits, and a reference plugin
that is this fork's existing math code moved.

## Scope

In scope: `client.addMarkdownExtension` for assistant messages, block protection in the streaming
splitter driven by extension-declared delimiters, and `SvgXml` and `MarkdownSource` exported from
`@getpaseo/plugin/client/react-native`. The reference plugin `plugin-examples/markdown-math`
proves all of it. The fork PR removes the built-in KaTeX patch and adopts the plugin.

Out of scope: user messages, reasoning rows, plan cards, and file previews keep their current
parsers. No `Markdown` component is exported. No new host module specifier is added, so the
compiler, scaffold, and boundary tests do not change. The protocol does not change.

## Why not export the renderer

The assistant rules object is 428 lines inline at `packages/app/src/components/message.tsx:1523-1951`
and closes over `client`, `fileLinkActions`, `markdownParser`, `occurrenceKey`, `phase`, `serverId`,
and `workspaceRoot`. Exporting it means extracting that block, deciding which closures the host
supplies to plugins, and publishing a component whose props are a third-party AST. The plugin
would still need SVG, and would still have to split each message into text and math segments
because a timeline transformer replaces the whole item.

This fork adds LaTeX with four lines in `message.tsx`: two imports, `.use(markdownMath)` on the
parser, and `...mathMarkdownRules` in the rules object. The SDK change makes those two hooks
pluggable. The assistant row stays Paseo's. Nothing is replaced, so nothing has to be redrawn.

One more piece of the fork patch is a host concern, not a plugin concern.
`packages/app/src/utils/split-markdown-blocks.ts` divides a streaming message into render blocks
before any parser runs. The fork adds 98 lines there so a block is not split inside an open code
fence or an open `$$` block. A plugin parser cannot do this: the fork's own `mathBlock` rule returns
`false` on an unclosed block (`packages/app/src/utils/markdown-math.ts:81`), so during streaming
the parser never sees the formula at all. Without host protection, streamed display math flickers
on every client. The host must protect blocks it does not understand, so the protection is driven
by delimiters the extension declares.

## Capability 1: `addMarkdownExtension`

### Contract

Add to `packages/plugin/src/client/contracts.ts`:

```ts
import type MarkdownIt from "markdown-it";
import type { RenderRules } from "react-native-markdown-display";

export interface PluginMarkdownBlockDelimiter {
  open: string;
  close: string;
}

export interface PluginMarkdownExtension {
  id: string;
  /** Runs once per parser build with Paseo's live markdown-it instance. */
  parser?: (markdown: MarkdownIt) => void;
  /** Merged after Paseo's built-in assistant rules, so a plugin rule wins on collision. */
  rules?: RenderRules;
  /** Line-leading pairs the streaming splitter must not split inside, open or unclosed. */
  blockDelimiters?: PluginMarkdownBlockDelimiter[];
}

export interface PluginClientContext extends PluginCommandCapabilities {
  // ...existing methods
  addMarkdownExtension(contribution: PluginMarkdownExtension): PluginCleanup;
}
```

`RenderRules` is an index signature over `RenderFunction`, so every key is already optional.
`RenderFunction`'s fourth argument is `styles: any`; a plugin narrows it as this fork's
`math-rules.tsx` does.

Add `@types/markdown-it` and `react-native-markdown-display` to `packages/plugin/package.json` as
devDependencies and optional peerDependencies. `packages/app` already types `markdown-it@10` with
`@types/markdown-it@14`; this fork's `markdown-math.ts` is proof the mismatch is tolerable.

### Semantics

- `id` is required and unique per plugin. A duplicate throws at registration, matching `addTheme`.
- `parser` is applied with `markdownIt.use(parser)`. It runs each time the assistant parser is
  built, which is once per `AssistantMessage` mount and again when the installed plugin set changes.
- `rules` are spread last. A plugin can add token types or override a built-in rule. Plugins are
  trusted code; this is deliberate.
- `blockDelimiters` are matched at the start of a line after any blockquote or list-item prefix.
  A line that opens a pair without closing it on the same line starts a protected region that ends
  at the first later line containing an unescaped `close`. Blank lines inside a protected region
  never split the message, and an unclosed region runs to the end of the text. Escaped delimiters
  do not open or close a region.
- The returned cleanup is idempotent. Removing the extension rebuilds the parser and rules.
- A plugin that throws inside `parser` fails that parser build. This matches how a throwing
  markdown-it plugin fails today; nothing is caught.

### Block protection

The splitter runs in two places outside React: the stream reducer that promotes completed blocks
(`packages/app/src/types/stream.ts`, the `promotedItems` map) and the height estimator that web
virtualization calls (`packages/app/src/utils/assistant-message-height-estimate.ts:3`). It also runs
in `AssistantMessage` at `message.tsx:1953`. Neither reducer nor estimator can call a hook, so the
delimiters are pushed rather than pulled: `PluginRegistry.publish()`
(`packages/app/src/plugins/registry.ts:151`) flattens every installed plugin's `blockDelimiters`
and calls the splitter's `setMarkdownBlockDelimiters`. The splitter file imports nothing from the
plugin subsystem, and `splitMarkdownBlocks(text, options?)` accepts an explicit list so tests need
no registry. A plugin that loads mid-stream does not re-split blocks already promoted; the next
message is protected.

Two changes to `split-markdown-blocks.ts`, as two commits:

1. **Unclosed fence protection.** Upstream's splitter finds structural blank lines by parsing the
   whole text with markdown-it, so a closed fence already stays whole. An unclosed fence during
   streaming does not, because markdown-it emits no fence token for it. Track an open fence by
   character and length and hold every line until it closes or the text ends. No plugin
   involvement. This is the fork's existing logic and its seven fence tests, and it stands on its
   own as an upstream bug fix.
2. **Delimiter protection.** Add the open-pair state and the registry read above. This is the
   fork's existing display-math logic with the `$$` and `\[` table replaced by the declared pairs,
   and its thirteen math tests rewritten to register delimiters instead of assuming them.

`findUnescapedDelimiter` and `isEscaped` move from `markdown-math.ts` into the splitter's file.
The plugin carries its own copy of the same ~20 lines: they are the only code the parser rules
and the splitter both need, and plugin code cannot import from the app. The duplication is
deliberate.

### Host wiring

| File                                                        | Change                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/app/src/plugins/types.ts`                         | `markdownExtensions: PluginMarkdownExtension[]` on `EvaluatedPlugin`.                                                                                                                                                                                                                                           |
| `packages/app/src/plugins/evaluate.ts`                      | Collector entry, `markdownExtensionIds` set, `addMarkdownExtension` mirroring `addTheme` at `:287`, and the return field.                                                                                                                                                                                       |
| `packages/app/src/plugins/registry.ts`                      | `markdownExtensions: []` in the empty-plugin default at `:93`; `publish()` at `:151` calls `setMarkdownBlockDelimiters`.                                                                                                                                                                                        |
| `packages/app/src/components/message.tsx`                   | In `AssistantMessage`: read `useInstalledPlugins()`, memoize `flatMap((plugin) => plugin.markdownExtensions)` on the snapshot, fold `parser` into the existing parser `useMemo` at `:1503`, spread `rules` last in the existing rules `useMemo` and add the extensions array to its dependency list at `:1951`. |
| `packages/app/src/utils/split-markdown-blocks.ts`           | The two commits above.                                                                                                                                                                                                                                                                                          |
| `packages/app/src/plugins/markdown-extensions.ts`           | New. `collectMarkdownExtensions`, `collectMarkdownBlockDelimiters`, `applyMarkdownExtensionParsers`, `mergeMarkdownExtensionRules`.                                                                                                                                                                             |
| `packages/app/src/plugins/react-native/runtime.ts`          | Provide `SvgXml` from `react-native-svg` and `MarkdownSource`.                                                                                                                                                                                                                                                  |
| `packages/app/src/plugins/react-native/markdown-source.tsx` | New. `Text` or `View` carrying `dataSet={{ paseoMarkdownSource: source }}`.                                                                                                                                                                                                                                     |
| `packages/app/src/assistant-selection-copy/markup.ts`       | `MARKDOWN_COPY_SOURCE_ATTRIBUTE` and its `dataSet` key.                                                                                                                                                                                                                                                         |
| `packages/app/src/assistant-selection-copy/content.web.ts`  | One Turndown rule emitting the declared source verbatim; `hasMarkdownContent` counts it.                                                                                                                                                                                                                        |

`useInstalledPlugins()` is a global `useSyncExternalStore` (`registry.ts:166`). Its snapshot is
identity-stable between publishes, so the parser and rules memos rebuild only when a plugin
loads or unloads. Streaming blocks pass through `MemoizedMarkdownBlock` unchanged.

The composition itself is four pure functions in `packages/app/src/plugins/markdown-extensions.ts`:
collect extensions and delimiters from installed plugins, apply parsers to a markdown-it instance,
and merge rules after the built-ins. `AssistantMessage` calls them; the registry calls the
delimiter one. They are unit-tested there because `AssistantMessage` has no render test harness.

### Compatibility

Additive. A client that predates this capability cannot evaluate a plugin that calls it and reports
`client.addMarkdownExtension is not a function`; the plugin's `requirements.paseo` prevents that by
naming the first release that ships it. This is the `addTheme` precedent. No
`server_info.features` flag and no `COMPAT` tag: there is no shim to delete later.

## Capability 2: `SvgXml` and `MarkdownSource`

### Contract

Add to `packages/plugin/src/client/react-native.ts`:

```ts
/** Renders an SVG document string. Narrower than react-native-svg's XmlProps by design. */
export declare const SvgXml: ComponentType<{
  xml: string | null;
  width?: number | string;
  height?: number | string;
  color?: string;
}>;

export interface MarkdownSourceProps {
  /** The markdown this element copies as when a web selection includes it. */
  source: string;
  /** Render a block (`View`) instead of an inline run (`Text`). Default false. */
  display?: boolean;
  style?: StyleProp<ViewStyle | TextStyle>;
  children: ReactNode;
}

/** Wraps non-text content so a web drag selection copies `source` verbatim. */
export declare const MarkdownSource: ComponentType<MarkdownSourceProps>;
```

`SvgXml` is `react-native-svg`'s component re-exported through
`packages/app/src/plugins/react-native/runtime.ts`. `MarkdownSource` is a new host component,
`packages/app/src/plugins/react-native/markdown-source.tsx`: a `Text` for inline content or a
`View` for `display`, carrying `dataSet={{ paseoMarkdownSource: source }}`, which react-native-web
renders as `data-paseo-markdown-source` and native ignores. The web copy serializer
(`packages/app/src/assistant-selection-copy/content.web.ts`) gains one Turndown rule that emits
that attribute's value verbatim for any element carrying it, and `hasMarkdownContent` counts such
an element as content so a formula-only selection still copies. The attribute name lives beside
the other `data-paseo-markdown-*` constants in `assistant-selection-copy/markup.ts`.

### Why two components and not the module

`@getpaseo/plugin/client/react-native` is already external in the compiler and already in the
scaffold's devDependencies. Exporting `SvgXml` through it needs no change to
`packages/server/src/server/plugins/compiler.ts`, no new specifier in
`plugin-sdk-specifiers.ts`, no scaffold change, and no boundary-test change. The reference's
"do not import `react-native-svg`" rule stays true; the SDK supplies a sanctioned primitive
beside `Icon` and `Modal`.

`SvgXml` is already cross-platform in this app: `packages/app/src/components/material-file-icon.tsx:7`
and `provider-catalog-list.tsx:4` use it in files with no platform suffix, and
`node_modules/react-native-svg/lib/module/xml.js` imports only `react` and local utilities.

## Reference plugin: `plugin-examples/markdown-math`

The plugin is this fork's math code with one new component and no host-specific imports. It ships
source only; see Tests for why.

| File                      | Source                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/markdown-math.ts` | `packages/app/src/utils/markdown-math.ts` moved whole. The app's copies of `findUnescapedDelimiter` and `isEscaped` move to the splitter; the plugin keeps its own, because plugin code cannot import from the app. Registers `math_inline` and `math_block` tokens for `$…$`, `\(…\)`, `$$…$$`, `\[…\]`, and ` ```math ` fences. |
| `client/math-rules.tsx`   | `packages/app/src/components/markdown/math-rules.tsx`, with `MathFormula` imported locally.                                                                                                                                                                                                                                       |
| `client/math-formula.tsx` | New. Bundles `mathjax-full`, calls `tex2svg`, renders `<SvgXml xml={svg} />` inside `MarkdownSource`. Replaces both `math-formula.web.tsx` and `math-formula.native.tsx`; one renderer for four clients, and native typesets for the first time.                                                                                  |
| `index.client.tsx`        | `client.addMarkdownExtension({ id: "math", parser: markdownMath, rules: mathMarkdownRules, blockDelimiters: [{ open: "$$", close: "$$" }, { open: "\\[", close: "\\]" }] })`.                                                                                                                                                     |

Text color reaches the formula the same way it does today: math tokens are leaf nodes, so the
renderer hands them the inherited text style as the fifth `RenderFunction` argument. The
component reads `color` from it and passes it to `SvgXml`, and wraps the `SvgXml` in
`MarkdownSource` with the formula's `source`, so a web drag selection copies the LaTeX. See Copy
and selection.

MathJax's SVG output embeds glyph outlines as `<path>` data, so there is no font or CSS to
deliver. Bundle size after tree-shaking is measured during implementation and recorded in the
example's README. Whether MathJax emits `fill="currentColor"` is verified in the first hour;
if not, the component sets `fill` from `color` on the root element before rendering.

`packages/plugin`'s `typecheck` script runs `tsgo -p tsconfig.examples.json`, whose `include` is
`../../plugin-examples/**/*.ts{,x}`, so the example is typechecked in CI with the SDK.

## Copy and selection

The turn copy button is the primary copy path and this design does not change it.
`packages/app/src/agent-stream/strategy.ts:167` collects each `assistant_message`'s raw `text`, and
`packages/app/src/utils/rich-clipboard.ts:22` writes that markdown unchanged as `text/plain`. LaTeX
source survives verbatim on every client, independent of how the formula is drawn.

Web drag selection improves. Today the fork renders KaTeX `htmlAndMathml` without `copy-tex`, so
selecting `x^2+\frac{a}{b}` copies the visible text `x2+ba` plus the hidden MathML.

A hidden source `Text` would not fix it. Web copy is not the browser's text extraction:
`AssistantSelectionCopySurface` intercepts `onCopy`, clones the selected DOM, and runs it through
Turndown (`content.web.ts:23`), whose default escaping is not overridden. Any LaTeX that reaches it
as a text node is mangled: `\frac` becomes `\\frac`, `x_1` becomes `x\_1`. Turndown also strips
whitespace adjacent to block elements, so a formula wrapped in a `View` (a `div` on web) copies as
`Energy is$E = mc^2$here`.

`MarkdownSource` uses the serializer's own convention instead. The wrapper carries
`data-paseo-markdown-source`, and one Turndown rule emits that value verbatim, bypassing escaping.
Inline content renders as a nested `Text`, which react-native-web emits as a `span`, so the spaces
around it survive; `display` content renders as a `View`, so it copies as its own paragraph. An SVG
of `<path>` glyphs contributes nothing on its own; the declared source is what a selection copies.
A selection that starts or ends inside the formula does not include the wrapper element and
copies nothing for it.

Native per-formula long-press copy is lost. React Native selection is per `Text`, and an SVG is not
text. Today it works only because the formula is rendered as raw text. The turn copy button at
`packages/app/src/components/message.tsx:682` renders on native and covers it.

The `text/html` clipboard flavor at `rich-clipboard.ts:24` renders with `createAssistantMarkdownParser()`
and no extension, so `$…$` stays literal there. This is true in the fork today. Applying the same
`parser` at that site is a follow-on, not part of this PR.

## Fork first, then upstream

The same commits go out twice under two `docs/fork-governance.md` modes. Build and verify on the
fork. Propose upstream only after the fork PR has merged with the evidence attached.

### Track B: fork

Develop on a feature branch from `origin/internal/main`. The branch removes the built-in patch and
adopts the plugin, so `internal/main` becomes a tree with no KaTeX code and proves the plugin path
on its own. With the patch present, both it and the plugin register `math_inline` and
`math_block`, and a plugin failure still shows a typeset formula from the patch.

Delete from `packages/app`: the four patch lines in `message.tsx`,
`components/markdown/math-rules.tsx`, `components/math-formula.web.tsx`,
`components/math-formula.native.tsx`, `components/math-formula.d.ts`,
`components/math-formula.browser.test.tsx`, and the `katex` dependency.

Keep in `packages/app`: `utils/split-markdown-blocks.ts` as changed above, its tests,
`types/react-native-markdown-display-internals.d.ts`, and the two math tests rewritten as host
tests (see Tests).

Move to `plugin-examples/markdown-math`: `utils/markdown-math.ts` and
`components/markdown/math-rules.tsx` as source.

Mobile users run upstream's app, which has no `addMarkdownExtension` until Track A ships. On those
clients the plugin's client entry fails with `is not a function`, the plugin shows an error under
Settings → Plugins, and assistant text renders `$E = mc^2$ ` literally. Today's fork mobile shows the
same literal string in a selectable `Text`. There is no user-visible regression, and the
`docs/fork-retirement.md` line "Native renders readable selectable source instead of failing"
remains true.

Open the branch as a `Downstream feature: true` pull request to `internal/main` with one
`Downstream rationale:` line. This PR also updates `docs/fork-retirement.md`: add itself to the
LaTeX capability's fork evidence and record that retirement now runs through the Track A PR
rather than the closed getpaseo/paseo#2562. Leave the "Upstream `main` provides the full behavior"
box unchecked until Track A merges. Land it with `/ship` steps 1 through 5 and 8; steps 6 and 7
apply only to imports.

Fork CI on this PR is the full-suite run: lint, typecheck, server, app, plugin, protocol, client,
and highlight tests, plugin typecheck including `tsconfig.examples.json`, and desktop
`test:e2e:renderer`. Do not run the full suite locally.

### Track A: upstream

After Track B merges, create the candidate from fetched `origin/main`, never from `internal/main`,
and cherry-pick the merged commits, excluding the `docs/fork-retirement.md` change and every
fork-only deletion: `katex` in `packages/app/package.json` and `package-lock.json`, the
`math-formula.*` files, and `math-rules.tsx`. Upstream never had them, so the candidate's diff
against `origin/main` is the splitter change plus additions. The touched upstream files have no
upstream commits since the fork's merge base, so the picks apply clean, and the preflight's scope
list rejects a pick that drags `package.json` along.

The preflight checks that `origin/main` is the merge base, that the candidate does not descend from
`origin/internal/main`, and that every changed path is inside a declared scope. It runs no tests.
Run it with one `--allow-path` per touched path before `gh pr create`:

```sh
node scripts/check-upstream-port.mjs --candidate <ref> --upstream-ref origin/main \
  --integration-ref origin/internal/main \
  --allow-path packages/plugin --allow-path packages/app/src/plugins \
  --allow-path packages/app/src/components/message.tsx \
  --allow-path packages/app/src/utils/split-markdown-blocks.ts \
  --allow-path packages/app/src/utils/__tests__/split-markdown-blocks.test.ts \
  --allow-path packages/app/src/utils/markdown-math.test.ts \
  --allow-path packages/app/src/components/markdown/math-rules.test.tsx \
  --allow-path packages/app/src/types/react-native-markdown-display-internals.d.ts \
  --allow-path packages/app/e2e/browser/plugin-markdown-math.spec.ts \
  --allow-path packages/app/e2e/mobile/agent-device \
  --allow-path plugin-examples/markdown-math \
  --allow-path public-docs/plugins --allow-path docs/plugins.md
```

Re-run the boundary and loader tests and the Playwright spec on the candidate as a smoke check,
and attach the Track B evidence. Frame the PR as the capability upstream's closed LaTeX PR asked
for: timeline plugins handle math, and this is the smallest SDK surface that makes that possible.
The first commit is the unclosed-fence fix, which upstream can take on its own. The example plugin
is the proof and the review fixture.

## Verification

`docs/qa.md` requires a platform matrix with evidence and, for plugin changes, the boundary tests
and both runtime loaders. Gather all of it on the Track B branch. Paste commands with output;
screenshots in light and dark.

| Platform                | How                                                                                                                          | Where         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Boundaries and loaders  | `boundaries.test.ts`, `compiler.test.ts`, `plugin-process.test.ts`, `evaluate.test.ts`, each run alone with `--bail=1`       | Linux         |
| Splitter                | `packages/app/src/utils/__tests__/split-markdown-blocks.test.ts`                                                             | Linux         |
| Web                     | Playwright: `packages/app/e2e/browser/plugin-markdown-math.spec.ts`                                                          | Linux, and CI |
| Desktop Linux and macOS | `npm run dev:desktop`, screenshots                                                                                           | Linux, Mac    |
| iOS                     | `EXPO_PUBLIC_LOCAL_DAEMON=localhost:6768 npm run ios` against `npm run dev:server`; `markdown-math.ios.ad`                   | Mac           |
| Android                 | `REACT_NATIVE_PACKAGER_HOSTNAME=10.0.2.2 EXPO_PUBLIC_LOCAL_DAEMON=10.0.2.2:6768 npm run android`; `markdown-math.android.ad` | Mac           |

The Playwright spec copies `plugin-theme.spec.ts`: a temp directory holding `paseo-plugin.json`
and the client entry, `patchDaemonConfig({ pluginsEnabled: true })`, `installDirectoryPlugin`, then
assertions, then `pluginsEnabled` restored in `finally`. It asserts that an assistant message
containing `$E = mc^2$` renders an `svg` element and no literal `$`, that a streamed `$$` block
with an interior blank line renders as one formula, that a drag selection across the formula
copies `$E = mc^2$`, and that removing the plugin restores the literal text. The harness owns the
plugin switch; automated runs change no persistent config.

The Agent Device scripts follow `native-terminal-basic.ios.ad`: open `sh.paseo.debug`, reach an
agent with a seeded math reply, `wait "text"` for prose beside the formula, and assert the literal
`$` is absent. `EXPO_PUBLIC_*` is inlined at bundle time; rebuild with `npx expo start -c` when the
app connects to the wrong daemon. The Android emulator does not share the host loopback; `10.0.2.2`
is the host.

Manual verification against the dev daemon needs `pluginsEnabled: true` in
`.dev/paseo-home/config.json`, which has no such key today. Ask before setting it. This is the dev
home, never `~/.paseo`.

The browser capture harness is for `<webview>` compositor behavior and is not part of this
verification.

## Tests

Example-plugin tests do not run in CI. The root `test` script runs `--workspaces --if-present`,
`plugin-examples/` directories have no `package.json`, and nothing in `.github/workflows/ci.yml`
references them. The five example test files that exist today are not executed. So the example
ships source only, and coverage lives in `packages/app`, where CI runs it.

- `packages/app/src/plugins/evaluate.test.ts`: `addMarkdownExtension` collects the contribution,
  rejects a duplicate `id`, and its cleanup removes it. `SvgXml` is provided through
  `@getpaseo/plugin/client/react-native`, following the existing `Icon` case at `:444`.
- `packages/app/src/utils/markdown-math.test.ts`: keeps its cases and imports the parser rules from
  `plugin-examples/markdown-math/client/markdown-math`, so the shipped source is what is tested.
- `packages/app/src/components/markdown/math-rules.test.tsx`: keeps its cases, but registers the
  example's extension through `addMarkdownExtension` on an evaluated plugin and renders through
  `AssistantMessage`, so the host wiring is what is tested. It already imports five `@/` modules
  and could not have moved.
- `packages/app/src/utils/__tests__/split-markdown-blocks.test.ts`: the seven fence cases unchanged
  for commit 1; the thirteen math cases register `$$` and `\[` delimiters explicitly for commit 2,
  plus one case proving an undeclared pair is not protected.
- `packages/app/e2e/browser/plugin-markdown-math.spec.ts` and the two Agent Device scripts, as
  described under Verification.

Run only the changed files: `npx vitest run <file> --bail=1`.

## Docs

- `public-docs/plugins/v0.8/reference.md`: a `Markdown extensions` section beside
  `Contribute a theme` at `:926` with the contract, the ordering rule, `blockDelimiters`, and the
  old-client failure; `SvgXml` added to the Host UI list; the "do not import" sentence at `:140`
  unchanged.
- `docs/plugins.md`: a short `Contribute markdown extensions` section after the timeline items
  section, pointing at the reference and the example. That file has no contribution table.
- `docs/agent-stream-performance.md` owns the pipeline that names `markdown blocks` as a stage
  (`:15`). Add the protected-region rule under its `## Invariants` section rather than in a new doc:
  a block is never split inside an open fence or an open extension-declared pair, and an unclosed
  region runs to the end of the text.
- No migration-guide entry; the change is additive.

## Line budget

Host and SDK code only. Tests, docs, and the example are additional.

| File                                                                   | Commit | Lines    |
| ---------------------------------------------------------------------- | ------ | -------- |
| `packages/app/src/utils/split-markdown-blocks.ts`, unclosed fence      | 1      | ~30      |
| `packages/app/src/utils/split-markdown-blocks.ts`, declared delimiters | 2      | ~50      |
| `findUnescapedDelimiter` and `isEscaped`, moved into the splitter file | 2      | ~20      |
| `packages/plugin/src/client/contracts.ts`                              | 2      | ~12      |
| `packages/plugin/src/client/react-native.ts`                           | 2      | ~14      |
| `packages/plugin/package.json`                                         | 2      | ~4       |
| `packages/app/src/plugins/markdown-extensions.ts`                      | 2      | ~25      |
| `packages/app/src/plugins/react-native/runtime.ts`                     | 2      | 3        |
| `packages/app/src/plugins/react-native/markdown-source.tsx`            | 2      | ~12      |
| `packages/app/src/assistant-selection-copy/markup.ts`                  | 2      | 2        |
| `packages/app/src/assistant-selection-copy/content.web.ts`             | 2      | ~8       |
| `packages/app/src/plugins/types.ts`                                    | 2      | 1        |
| `packages/app/src/plugins/evaluate.ts`                                 | 2      | ~9       |
| `packages/app/src/plugins/registry.ts`                                 | 2      | ~4       |
| `packages/app/src/components/message.tsx`                              | 2      | ~10      |
| **Total**                                                              |        | **~204** |

About 100 of these lines are the fork's existing splitter and delimiter code, already covered by
twenty tests. Commit 1 is separable and stands as an upstream bug fix on its own.
