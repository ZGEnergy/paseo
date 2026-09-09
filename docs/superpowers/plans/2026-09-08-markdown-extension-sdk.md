# Markdown Extension SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client plugin extend assistant markdown parsing, block splitting, and rendering, export `SvgXml` and `MarkdownSource` to plugins, and ship LaTeX as `plugin-examples/markdown-math` while removing the fork's built-in KaTeX patch.

**Architecture:** Two additive SDK capabilities on the existing plugin client context (`addMarkdownExtension` with `parser`, `rules`, and `blockDelimiters`; two host UI exports). The host composes installed extensions into the assistant parser and rules through a small pure module, pushes declared block delimiters into the streaming splitter whenever the plugin registry publishes, and lets an element declare its own markdown copy source so the web copy serializer emits LaTeX verbatim. The plugin is the fork's math code moved, with one MathJax-to-SVG component replacing the web and native formula files.

**Tech Stack:** TypeScript, React Native / React Native Web, markdown-it, react-native-markdown-display, react-native-svg (`SvgXml`), mathjax-full (liteAdaptor + SVG output), Turndown, vitest, Playwright, Agent Device.

**Spec:** `docs/superpowers/specs/2026-09-08-markdown-extension-sdk-design.md`

**Decisions made during planning, now reflected in the spec:**

1. Copy uses a `MarkdownSource` host export and one Turndown rule instead of a hidden `Text`. Turndown escapes `\` and `_` in text nodes, so hidden text would corrupt LaTeX.
2. The splitter receives delimiters by push: `PluginRegistry.publish()` calls `setMarkdownBlockDelimiters(...)`. The spec described a pull from `getSnapshot()`; the observable behavior is identical and the splitter file stays free of plugin imports.
3. Extension composition lives in a new pure module `packages/app/src/plugins/markdown-extensions.ts` so it is unit-testable; `AssistantMessage` has no existing render test harness.
4. `docs/plugins.md` gets a short section, not a table row; that file has no contribution table.

## Global Constraints

- Work on the current worktree branch. `git rev-parse --git-dir` contains `/worktrees/`, so this checkout is already isolated. Do not create another worktree.
- Never run a whole test suite locally. Run one file at a time: `npx vitest run <file> --bail=1`. Fork CI is the full-suite run.
- After every code change: `npm run typecheck`, `npm run lint -- <changed files>`, `npm run format:files -- <changed files>`. Use only the npm scripts.
- After any change under `packages/plugin/src`, run `npm run build --workspace=@getpaseo/plugin` before typechecking `packages/app`; the app consumes the plugin package's `dist` declarations.
- No new host module specifier. `packages/server/src/server/plugins/compiler.ts`, `plugin-sdk-specifiers.ts`, the CLI scaffold, and `packages/plugin/src/boundaries.test.ts` are not modified.
- The protocol is not modified. No `COMPAT` tag is added; the change is additive.
- `rules` from extensions are spread after Paseo's built-in rules. A throwing `parser` is not caught. Extension `id` values are unique per plugin and validated with the existing `requireId`.
- `blockDelimiters` are matched at the start of a line after any blockquote or list-item prefix and up to three spaces. A line that opens a pair without closing it on the same line starts a protected region ending at the first later line containing an unescaped `close`. Blank lines inside a protected region never split; an unclosed region runs to the end of the text. Escaped delimiters neither open nor close.
- Plugin client code uses React Native primitives only. No DOM elements, no `className`, no `window`.
- Manual verification against the dev daemon needs `pluginsEnabled: true` in `.dev/paseo-home/config.json`, which currently has no such key. Ask the user before setting it. Never touch `~/.paseo`.
- Never restart the daemon on port 6767.

---

### Task 1: Splitter commit 1, unclosed-fence protection without math knowledge

**Files:**

- Modify: `packages/app/src/utils/split-markdown-blocks.ts` (whole file replaced)
- Modify: `packages/app/src/utils/__tests__/split-markdown-blocks.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `splitMarkdownBlocks(text: string): string[]` (unchanged signature), and `findUnescapedDelimiter(source: string, delimiter: string): number` exported from the splitter file.

This commit is the separable upstream bug fix. It removes the fork's hardcoded `$$` and `\[` protection from the splitter and moves the two escape helpers in from `markdown-math.ts`. Task 2 restores math protection through declared delimiters.

- [ ] **Step 1: Remove the nine math cases from the splitter test**

Delete these `it(...)` blocks from `packages/app/src/utils/__tests__/split-markdown-blocks.test.ts`, keeping every other case unchanged:

- `keeps display math with internal blank lines in one block`
- `keeps bracket-delimited display math with internal blank lines in one block`
- `splits after a punctuated same-line display formula`
- `splits after a multiline display formula with trailing content`
- `ignores escaped display delimiters on interior lines`
- `keeps an unclosed streamed display expression together`
- `keeps display math nested in a list together across blank lines`
- `keeps streamed display math nested in a blockquote together`

(That is eight blocks; the ninth math-related case, `splits after a punctuated same-line display formula`, is in the list above. Twelve cases remain.)

- [ ] **Step 2: Replace the splitter with the fence-only version**

Write `packages/app/src/utils/split-markdown-blocks.ts` as:

```ts
import MarkdownIt from "markdown-it";

const markdownBlockParser = new MarkdownIt();

function isEscaped(source: string, position: number): boolean {
  let backslashCount = 0;
  for (let index = position - 1; index >= 0 && source[index] === "\\"; index--) {
    backslashCount++;
  }
  return backslashCount % 2 === 1;
}

export function findUnescapedDelimiter(source: string, delimiter: string): number {
  let searchStart = 0;

  while (searchStart < source.length) {
    const delimiterStart = source.indexOf(delimiter, searchStart);
    if (delimiterStart === -1) {
      return -1;
    }
    if (!isEscaped(source, delimiterStart)) {
      return delimiterStart;
    }
    searchStart = delimiterStart + delimiter.length;
  }

  return -1;
}

function getFenceDelimiter(line: string) {
  const match = /^( {0,3})(`{3,}|~{3,})/.exec(line);
  return match?.[2] ?? null;
}

interface ProtectedBlockState {
  fenceCharacter: "`" | "~" | null;
  fenceLength: number;
}

// markdown-it only emits a fence token for a closed fence, so a fence that is still
// streaming has no token and its interior blank lines look like paragraph breaks.
function updateProtectedBlockState(line: string, state: ProtectedBlockState): void {
  const fenceDelimiter = getFenceDelimiter(line);
  if (state.fenceCharacter) {
    if (
      fenceDelimiter?.[0] === state.fenceCharacter &&
      fenceDelimiter.length >= state.fenceLength
    ) {
      state.fenceCharacter = null;
      state.fenceLength = 0;
    }
    return;
  }

  if (fenceDelimiter) {
    state.fenceCharacter = fenceDelimiter[0] as "`" | "~";
    state.fenceLength = fenceDelimiter.length;
  }
}

export function splitMarkdownBlocks(text: string): string[] {
  if (text.length === 0) {
    return [];
  }

  const blocks: string[] = [];
  let currentLines: string[] = [];
  const protectedBlockState: ProtectedBlockState = { fenceCharacter: null, fenceLength: 0 };
  let sawBlockSeparator = false;
  const lines = text.split("\n");
  const structuralBlankLines = getStructuralBlankLines(text, lines);

  for (const [index, line] of lines.entries()) {
    const isBlankLine = line.trim().length === 0;
    const isInsideProtectedBlock = protectedBlockState.fenceCharacter !== null;

    if (isBlankLine && (isInsideProtectedBlock || structuralBlankLines.has(index))) {
      currentLines.push(line);
      continue;
    }

    if (isBlankLine) {
      if (currentLines.length > 0) {
        sawBlockSeparator = true;
      }
      continue;
    }

    if (!isInsideProtectedBlock && sawBlockSeparator) {
      blocks.push(currentLines.join("\n"));
      currentLines = [];
      sawBlockSeparator = false;
    }

    currentLines.push(line);
    updateProtectedBlockState(line, protectedBlockState);
  }

  if (currentLines.length > 0) {
    blocks.push(currentLines.join("\n"));
  }

  return blocks.filter((block) => block.length > 0);
}

function getStructuralBlankLines(text: string, lines: string[]): Set<number> {
  const blankLines = new Set<number>();
  for (const token of markdownBlockParser.parse(text, {})) {
    if (token.level !== 0 || !token.map) {
      continue;
    }
    const [start, end] = token.map;
    for (let index = start; index < end - 1; index += 1) {
      if (lines[index]?.trim().length === 0) {
        blankLines.add(index);
      }
    }
  }
  return blankLines;
}
```

- [ ] **Step 3: Run the splitter test**

Run: `npx vitest run packages/app/src/utils/__tests__/split-markdown-blocks.test.ts --bail=1`
Expected: PASS, 12 tests.

- [ ] **Step 4: Typecheck, lint, format**

Run:

```bash
npm run typecheck
npm run lint -- packages/app/src/utils/split-markdown-blocks.ts packages/app/src/utils/__tests__/split-markdown-blocks.test.ts
npm run format:files -- packages/app/src/utils/split-markdown-blocks.ts packages/app/src/utils/__tests__/split-markdown-blocks.test.ts
```

Expected: no errors. `markdown-math.ts` still compiles because it keeps its own `findUnescapedDelimiter`.

- [ ] **Step 5: Commit and record the SHA**

```bash
git add packages/app/src/utils/split-markdown-blocks.ts packages/app/src/utils/__tests__/split-markdown-blocks.test.ts
git commit -m "fix(app): keep an unclosed streaming code fence in one markdown block"
git rev-parse HEAD
```

Write the printed SHA down as `SPLITTER_FENCE_SHA`. Task 12 checks this file state out onto the upstream candidate as its first commit.

---

### Task 2: Splitter commit 2, extension-declared block delimiters

**Files:**

- Modify: `packages/app/src/utils/split-markdown-blocks.ts`
- Modify: `packages/app/src/utils/__tests__/split-markdown-blocks.test.ts`

**Interfaces:**

- Consumes: Task 1's file.
- Produces:
  - `export interface MarkdownBlockDelimiter { open: string; close: string }`
  - `export interface SplitMarkdownBlocksOptions { blockDelimiters?: readonly MarkdownBlockDelimiter[] }`
  - `export function splitMarkdownBlocks(text: string, options?: SplitMarkdownBlocksOptions): string[]`
  - `export function setMarkdownBlockDelimiters(delimiters: readonly MarkdownBlockDelimiter[]): void`
  - `export function getMarkdownBlockDelimiters(): readonly MarkdownBlockDelimiter[]`

When `options.blockDelimiters` is omitted, the module-level list set by `setMarkdownBlockDelimiters` is used. The three production call sites (`types/stream.ts:1817`, `assistant-message-height-estimate.ts:82`, `message.tsx:1953`) pass only text and need no change.

- [ ] **Step 1: Write the failing tests**

Add to the top of `split-markdown-blocks.test.ts`, replacing the existing import line:

```ts
import { afterEach, describe, expect, it } from "vitest";
import {
  getMarkdownBlockDelimiters,
  setMarkdownBlockDelimiters,
  splitMarkdownBlocks,
} from "../split-markdown-blocks";

const MATH_DELIMITERS = [
  { open: "$$", close: "$$" },
  { open: "\\[", close: "\\]" },
];
const math = { blockDelimiters: MATH_DELIMITERS };
```

Add these cases inside the existing `describe("splitMarkdownBlocks", ...)` block, after the `keeps everything from an unclosed fence start as one block for streaming content` case:

```ts
it("keeps display math with internal blank lines in one block", () => {
  expect(
    splitMarkdownBlocks(
      "Before\n\n$$\n\\begin{aligned}\na &= b\n\nc &= d\n\\end{aligned}\n$$\n\nAfter",
      math,
    ),
  ).toEqual(["Before", "$$\n\\begin{aligned}\na &= b\n\nc &= d\n\\end{aligned}\n$$", "After"]);
});

it("keeps bracket-delimited display math with internal blank lines in one block", () => {
  expect(splitMarkdownBlocks("Before\n\n\\[\na^2 + b^2\n\n= c^2\n\\]\n\nAfter", math)).toEqual([
    "Before",
    "\\[\na^2 + b^2\n\n= c^2\n\\]",
    "After",
  ]);
});

it("splits after a punctuated same-line display formula", () => {
  expect(splitMarkdownBlocks("$$x$$.\n\ntext\n\n$$y$$", math)).toEqual(["$$x$$.", "text", "$$y$$"]);
});

it("splits after a multiline display formula with trailing content", () => {
  expect(splitMarkdownBlocks("$$\nx\n$$.\n\ntext\n\n\\[\ny\n\\] and then\n\nafter", math)).toEqual([
    "$$\nx\n$$.",
    "text",
    "\\[\ny\n\\] and then",
    "after",
  ]);
});

it("ignores escaped display delimiters on interior lines", () => {
  expect(
    splitMarkdownBlocks("Before\n\n$$\n\\$$ is literal\n\nstill math\n$$.\n\nAfter", math),
  ).toEqual(["Before", "$$\n\\$$ is literal\n\nstill math\n$$.", "After"]);
  expect(
    splitMarkdownBlocks(
      "Before\n\n\\[\n\\\\] is literal\n\nstill math\n\\] and then\n\nAfter",
      math,
    ),
  ).toEqual(["Before", "\\[\n\\\\] is literal\n\nstill math\n\\] and then", "After"]);
});

it("keeps an unclosed streamed display expression together", () => {
  expect(splitMarkdownBlocks("Before\n\n$$\na^2 + b^2\n\n= c^2", math)).toEqual([
    "Before",
    "$$\na^2 + b^2\n\n= c^2",
  ]);
});

it("keeps display math nested in a list together across blank lines", () => {
  expect(
    splitMarkdownBlocks(
      "Before\n\n- $$\n  \\begin{aligned}\n  a &= b\n\n  c &= d\n  \\end{aligned}\n  $$\n\nAfter",
      math,
    ),
  ).toEqual([
    "Before",
    "- $$\n  \\begin{aligned}\n  a &= b\n\n  c &= d\n  \\end{aligned}\n  $$",
    "After",
  ]);
});

it("keeps streamed display math nested in a blockquote together", () => {
  expect(splitMarkdownBlocks("Before\n\n> \\[\n> a^2 + b^2\n\n> = c^2", math)).toEqual([
    "Before",
    "> \\[\n> a^2 + b^2\n\n> = c^2",
  ]);
});

it("does not protect a pair that no extension declared", () => {
  expect(splitMarkdownBlocks("Before\n\n$$\na\n\nb\n$$")).toEqual(["Before", "$$\na", "b\n$$"]);
});

it("prefers the longest matching opener so $$ is not read as $", () => {
  const delimiters = [
    { open: "$", close: "$" },
    { open: "$$", close: "$$" },
  ];
  expect(splitMarkdownBlocks("$$\na\n\nb\n$$", { blockDelimiters: delimiters })).toEqual([
    "$$\na\n\nb\n$$",
  ]);
});
```

Add a second `describe` at the end of the file:

```ts
describe("setMarkdownBlockDelimiters", () => {
  afterEach(() => {
    setMarkdownBlockDelimiters([]);
  });

  it("supplies the default delimiters for callers that pass none", () => {
    setMarkdownBlockDelimiters(MATH_DELIMITERS);
    expect(getMarkdownBlockDelimiters()).toEqual(MATH_DELIMITERS);
    expect(splitMarkdownBlocks("Before\n\n$$\na\n\nb\n$$")).toEqual(["Before", "$$\na\n\nb\n$$"]);
  });

  it("clears protection when set back to an empty list", () => {
    setMarkdownBlockDelimiters(MATH_DELIMITERS);
    setMarkdownBlockDelimiters([]);
    expect(splitMarkdownBlocks("$$\na\n\nb\n$$")).toEqual(["$$\na", "b\n$$"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/app/src/utils/__tests__/split-markdown-blocks.test.ts --bail=1`
Expected: FAIL. The first failure is a type error or `setMarkdownBlockDelimiters is not a function`; with `--bail=1` the run stops there.

- [ ] **Step 3: Implement declared-delimiter protection**

In `split-markdown-blocks.ts`, add after `findUnescapedDelimiter`:

```ts
export interface MarkdownBlockDelimiter {
  open: string;
  close: string;
}

export interface SplitMarkdownBlocksOptions {
  blockDelimiters?: readonly MarkdownBlockDelimiter[];
}

let registeredBlockDelimiters: readonly MarkdownBlockDelimiter[] = [];

/** Installed plugins push their declared pairs here; the plugin registry calls this on publish. */
export function setMarkdownBlockDelimiters(delimiters: readonly MarkdownBlockDelimiter[]): void {
  registeredBlockDelimiters = delimiters;
}

export function getMarkdownBlockDelimiters(): readonly MarkdownBlockDelimiter[] {
  return registeredBlockDelimiters;
}

function stripMarkdownContainerPrefix(line: string): string {
  let remainder = line;
  let foundContainer = false;

  while (true) {
    const blockquote = /^ {0,3}>[ \t]?/.exec(remainder);
    if (blockquote) {
      remainder = remainder.slice(blockquote[0].length);
      foundContainer = true;
      continue;
    }

    const listItem = /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/.exec(remainder);
    if (listItem) {
      remainder = remainder.slice(listItem[0].length);
      foundContainer = true;
      continue;
    }

    return foundContainer ? remainder : line;
  }
}

interface OpenedBlockDelimiter {
  close: string;
  closesOnOpeningLine: boolean;
}

function getOpenedBlockDelimiter(
  line: string,
  delimiters: readonly MarkdownBlockDelimiter[],
): OpenedBlockDelimiter | null {
  if (delimiters.length === 0) {
    return null;
  }
  const content = stripMarkdownContainerPrefix(line).replace(/^ {0,3}/, "");
  // Longest opener first so "$$" is never read as "$".
  const candidates = [...delimiters].sort((left, right) => right.open.length - left.open.length);
  for (const delimiter of candidates) {
    if (!content.startsWith(delimiter.open)) {
      continue;
    }
    const remainder = content.slice(delimiter.open.length);
    return {
      close: delimiter.close,
      closesOnOpeningLine: findUnescapedDelimiter(remainder, delimiter.close) !== -1,
    };
  }
  return null;
}
```

Replace `ProtectedBlockState` and `updateProtectedBlockState` with:

```ts
interface ProtectedBlockState {
  fenceCharacter: "`" | "~" | null;
  fenceLength: number;
  openDelimiterClose: string | null;
}

function updateProtectedBlockState(
  line: string,
  state: ProtectedBlockState,
  delimiters: readonly MarkdownBlockDelimiter[],
): void {
  if (state.openDelimiterClose) {
    if (findUnescapedDelimiter(line, state.openDelimiterClose) !== -1) {
      state.openDelimiterClose = null;
    }
    return;
  }

  const fenceDelimiter = getFenceDelimiter(line);
  if (state.fenceCharacter) {
    if (
      fenceDelimiter?.[0] === state.fenceCharacter &&
      fenceDelimiter.length >= state.fenceLength
    ) {
      state.fenceCharacter = null;
      state.fenceLength = 0;
    }
    return;
  }

  if (fenceDelimiter) {
    state.fenceCharacter = fenceDelimiter[0] as "`" | "~";
    state.fenceLength = fenceDelimiter.length;
    return;
  }

  const opened = getOpenedBlockDelimiter(line, delimiters);
  if (opened && !opened.closesOnOpeningLine) {
    state.openDelimiterClose = opened.close;
  }
}
```

Change the `splitMarkdownBlocks` signature and the three lines that reference the state:

```ts
export function splitMarkdownBlocks(
  text: string,
  options: SplitMarkdownBlocksOptions = {},
): string[] {
  if (text.length === 0) {
    return [];
  }

  const delimiters = options.blockDelimiters ?? registeredBlockDelimiters;
  const blocks: string[] = [];
  let currentLines: string[] = [];
  const protectedBlockState: ProtectedBlockState = {
    fenceCharacter: null,
    fenceLength: 0,
    openDelimiterClose: null,
  };
```

and inside the loop:

```ts
const isInsideProtectedBlock =
  protectedBlockState.fenceCharacter !== null || protectedBlockState.openDelimiterClose !== null;
```

and at the loop's end:

```ts
currentLines.push(line);
updateProtectedBlockState(line, protectedBlockState, delimiters);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/app/src/utils/__tests__/split-markdown-blocks.test.ts --bail=1`
Expected: PASS, 24 tests.

- [ ] **Step 5: Typecheck, lint, format**

Run:

```bash
npm run typecheck
npm run lint -- packages/app/src/utils/split-markdown-blocks.ts packages/app/src/utils/__tests__/split-markdown-blocks.test.ts
npm run format:files -- packages/app/src/utils/split-markdown-blocks.ts packages/app/src/utils/__tests__/split-markdown-blocks.test.ts
```

Expected: no errors.

- [ ] **Step 6: Commit and record the SHA**

```bash
git add packages/app/src/utils/split-markdown-blocks.ts packages/app/src/utils/__tests__/split-markdown-blocks.test.ts
git commit -m "feat(app): protect extension-declared block delimiters in the markdown block splitter"
git rev-parse HEAD
```

Write the printed SHA down as `SPLITTER_DELIMITERS_SHA`.

---

### Task 3: SDK contract, exports, and declarations

**Files:**

- Modify: `packages/plugin/src/client/contracts.ts`
- Modify: `packages/plugin/src/client/index.ts`
- Modify: `packages/plugin/src/client/react-native.ts`
- Modify: `packages/plugin/package.json`
- Test: `packages/plugin/src/boundaries.test.ts` (existing, unchanged)

**Interfaces:**

- Produces, from `@getpaseo/plugin/client`:
  - `interface PluginMarkdownBlockDelimiter { open: string; close: string }`
  - `interface PluginMarkdownExtension { id: string; parser?: (markdown: MarkdownIt) => void; rules?: RenderRules; blockDelimiters?: PluginMarkdownBlockDelimiter[] }`
  - `PluginClientContext.addMarkdownExtension(contribution: PluginMarkdownExtension): PluginCleanup`
- Produces, from `@getpaseo/plugin/client/react-native`:
  - `SvgXml: ComponentType<{ xml: string | null; width?: number | string; height?: number | string; color?: string }>`
  - `MarkdownSource: ComponentType<{ source: string; display?: boolean; style?: StyleProp<ViewStyle | TextStyle>; children: ReactNode }>`

- [ ] **Step 1: Add the contract types**

In `packages/plugin/src/client/contracts.ts`, add after the existing imports at the top:

```ts
import type MarkdownIt from "markdown-it";
import type { RenderRules } from "react-native-markdown-display";
```

Add before `export interface PluginClientContext`:

```ts
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
```

Inside `export interface PluginClientContext extends PluginCommandCapabilities {`, add after the `addTimelineRenderer` member:

```ts
  addMarkdownExtension(contribution: PluginMarkdownExtension): PluginCleanup;
```

- [ ] **Step 2: Export the types from the client entry**

In `packages/plugin/src/client/index.ts`, inside the `export type { ... } from "./contracts.js";` list, add after `PluginTimelineRendererContribution,`:

```ts
  PluginMarkdownBlockDelimiter,
  PluginMarkdownExtension,
```

- [ ] **Step 3: Declare the two host UI exports**

In `packages/plugin/src/client/react-native.ts`, extend the `react-native` type import to include `TextStyle`:

```ts
import type {
  StyleProp,
  ViewStyle,
  TextStyle,
  ScrollView as NativeScrollView,
  ScrollViewProps,
  FlatList as NativeFlatList,
  FlatListProps,
  TextInput as NativeTextInput,
  TextInputProps,
} from "react-native";
```

Add at the end of the file:

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

- [ ] **Step 4: Add the type dependencies to the SDK package**

In `packages/plugin/package.json`, add to `devDependencies` (keep alphabetical order):

```json
    "@types/markdown-it": "^14.1.2",
    "react-native-markdown-display": "^7.0.2",
```

Add to `peerDependencies`:

```json
    "@types/markdown-it": "^14.1.2",
    "react-native-markdown-display": "^7.0.2",
```

Add to `peerDependenciesMeta`:

```json
    "@types/markdown-it": {
      "optional": true
    },
    "react-native-markdown-display": {
      "optional": true
    }
```

Run: `npm install`
Expected: lockfile updated, no peer warnings for these two.

- [ ] **Step 5: Run the boundary test, typecheck, and build the SDK**

Run:

```bash
npx vitest run packages/plugin/src/boundaries.test.ts --bail=1
npm run typecheck --workspace=@getpaseo/plugin
npm run build --workspace=@getpaseo/plugin
```

Expected: boundary test PASS (client entries may import non-Node modules), typecheck clean, `dist/client/{contracts,index,react-native}.d.ts` regenerated.

- [ ] **Step 6: Format and commit**

```bash
npm run format:files -- packages/plugin/src/client/contracts.ts packages/plugin/src/client/index.ts packages/plugin/src/client/react-native.ts packages/plugin/package.json
git add packages/plugin/src/client/contracts.ts packages/plugin/src/client/index.ts packages/plugin/src/client/react-native.ts packages/plugin/package.json package-lock.json
git commit -m "feat(plugin): addMarkdownExtension contract and SvgXml, MarkdownSource host exports"
```

---

### Task 4: Extension composition module

**Files:**

- Create: `packages/app/src/plugins/markdown-extensions.ts`
- Test: `packages/app/src/plugins/markdown-extensions.test.ts`

**Interfaces:**

- Consumes: `PluginMarkdownExtension` from Task 3; `MarkdownBlockDelimiter` from Task 2.
- Produces:
  - `collectMarkdownExtensions(plugins: readonly { markdownExtensions: PluginMarkdownExtension[] }[]): PluginMarkdownExtension[]`
  - `collectMarkdownBlockDelimiters(plugins): MarkdownBlockDelimiter[]`
  - `applyMarkdownExtensionParsers(parser: MarkdownIt, extensions: readonly PluginMarkdownExtension[]): MarkdownIt`
  - `mergeMarkdownExtensionRules(baseRules: RenderRules, extensions: readonly PluginMarkdownExtension[]): RenderRules`

- [ ] **Step 1: Write the failing test**

Create `packages/app/src/plugins/markdown-extensions.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/app/src/plugins/markdown-extensions.test.ts --bail=1`
Expected: FAIL, cannot resolve `./markdown-extensions`.

- [ ] **Step 3: Write the module**

Create `packages/app/src/plugins/markdown-extensions.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/app/src/plugins/markdown-extensions.test.ts --bail=1`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck, lint, format, commit**

```bash
npm run typecheck
npm run lint -- packages/app/src/plugins/markdown-extensions.ts packages/app/src/plugins/markdown-extensions.test.ts
npm run format:files -- packages/app/src/plugins/markdown-extensions.ts packages/app/src/plugins/markdown-extensions.test.ts
git add packages/app/src/plugins/markdown-extensions.ts packages/app/src/plugins/markdown-extensions.test.ts
git commit -m "feat(app): compose plugin markdown extensions into parser, rules, and block delimiters"
```

---

### Task 5: Host registration of markdown extensions

**Files:**

- Modify: `packages/app/src/plugins/types.ts:8-19` (import list) and `:25-38` (`EvaluatedPlugin`)
- Modify: `packages/app/src/plugins/evaluate.ts:17-26` (import list), `:82-93` (collector), `:94-103` (id sets), after `:334` (new method), `:410-419` (return)
- Modify: `packages/app/src/plugins/registry.ts:85-94` (empty default), `:151-158` (`publish`)
- Test: `packages/app/src/plugins/evaluate.test.ts`, `packages/app/src/plugins/registry.test.ts`

**Interfaces:**

- Consumes: `PluginMarkdownExtension` (Task 3), `collectMarkdownBlockDelimiters` (Task 4), `setMarkdownBlockDelimiters` (Task 2).
- Produces: `EvaluatedPlugin.markdownExtensions: PluginMarkdownExtension[]`; `PluginClientContext.addMarkdownExtension` implemented; registry pushes delimiters on every publish.

- [ ] **Step 1: Write the failing evaluate tests**

Append to `packages/app/src/plugins/evaluate.test.ts`, inside the outer `describe` next to the existing `provides the host Icon component` case:

```ts
it("collects markdown extensions and rejects a duplicate id", () => {
  const plugin = evaluatePluginClientBundle(
    "example",
    `(function(require) {
        const module = { exports: {} };
        module.exports.default = function(plugin) {
          plugin.addMarkdownExtension({
            id: "math",
            blockDelimiters: [{ open: "$$", close: "$$" }],
          });
          let message = null;
          try {
            plugin.addMarkdownExtension({ id: "math" });
          } catch (error) {
            message = error.message;
          }
          if (message !== "Duplicate markdown extension: math") {
            throw new Error("expected duplicate rejection, got " + message);
          }
          return function() {};
        };
        return module.exports;
      })`,
  );

  expect(plugin.markdownExtensions.map((extension) => extension.id)).toEqual(["math"]);
  expect(plugin.markdownExtensions[0]?.blockDelimiters).toEqual([{ open: "$$", close: "$$" }]);
});

it("rejects a markdown extension with an empty block delimiter", () => {
  expect(() =>
    evaluatePluginClientBundle(
      "example",
      `(function(require) {
          const module = { exports: {} };
          module.exports.default = function(plugin) {
            plugin.addMarkdownExtension({ id: "math", blockDelimiters: [{ open: "", close: "$$" }] });
            return function() {};
          };
          return module.exports;
        })`,
    ),
  ).toThrow("Markdown extension math has an empty block delimiter");
});

it("removes a markdown extension through its cleanup", () => {
  const plugin = evaluatePluginClientBundle(
    "example",
    `(function(require) {
        const module = { exports: {} };
        module.exports.default = function(plugin) {
          const remove = plugin.addMarkdownExtension({ id: "math" });
          remove();
          remove();
          return function() {};
        };
        return module.exports;
      })`,
  );

  expect(plugin.markdownExtensions).toEqual([]);
});
```

- [ ] **Step 2: Run the evaluate test to verify it fails**

Run: `npx vitest run packages/app/src/plugins/evaluate.test.ts --bail=1`
Expected: FAIL, `plugin.addMarkdownExtension is not a function`.

- [ ] **Step 3: Add the field to `EvaluatedPlugin`**

In `packages/app/src/plugins/types.ts`, add `PluginMarkdownExtension,` to the `@getpaseo/plugin/client` type import (after `PluginTimelineTransformerContribution,`), and add to `EvaluatedPlugin` after `timelineRenderers`:

```ts
  markdownExtensions: PluginMarkdownExtension[];
```

- [ ] **Step 4: Implement `addMarkdownExtension` in the evaluator**

In `packages/app/src/plugins/evaluate.ts`:

Add `type PluginMarkdownExtension,` to the `@getpaseo/plugin/client` import list (after `type PluginCommandCenterItemContribution,`).

In the `collector` literal, add after `timelineRenderers: [],`:

```ts
    markdownExtensions: [],
```

After `const timelineRendererIds = new Set<string>();` add:

```ts
const markdownExtensionIds = new Set<string>();
```

Inside `pluginContext`, after the `addTimelineRenderer` method, add:

```ts
    addMarkdownExtension(contribution: PluginMarkdownExtension) {
      const normalizedId = requireId(contribution.id, "markdown extension id");
      if (markdownExtensionIds.has(normalizedId)) {
        throw new Error(`Duplicate markdown extension: ${normalizedId}`);
      }
      for (const pair of contribution.blockDelimiters ?? []) {
        if (!pair.open || !pair.close) {
          throw new Error(`Markdown extension ${normalizedId} has an empty block delimiter`);
        }
      }
      markdownExtensionIds.add(normalizedId);
      return register(
        collector.markdownExtensions,
        { ...contribution, id: normalizedId },
        () => markdownExtensionIds.delete(normalizedId),
      );
    },
```

In the returned object at the end of the function, add after `timelineRenderers: collector.timelineRenderers,`:

```ts
    markdownExtensions: collector.markdownExtensions,
```

- [ ] **Step 5: Run the evaluate test to verify it passes**

Run: `npx vitest run packages/app/src/plugins/evaluate.test.ts --bail=1`
Expected: PASS.

- [ ] **Step 6: Write the failing registry test**

Append to `packages/app/src/plugins/registry.test.ts`, inside its outer `describe`:

```ts
it("pushes declared block delimiters into the markdown splitter on publish", () => {
  const clientBundle = `(function() {
      const module = { exports: {} };
      module.exports.default = function(plugin) {
        plugin.addMarkdownExtension({
          id: "math",
          blockDelimiters: [{ open: "$$", close: "$$" }, { open: "\\\\[", close: "\\\\]" }],
        });
        return function() {};
      };
      return module.exports;
    })`;

  pluginRegistry.installCatalog("host-a", [{ id: "math-plugin", clientBundle }]);
  expect(getMarkdownBlockDelimiters()).toEqual([
    { open: "$$", close: "$$" },
    { open: "\\[", close: "\\]" },
  ]);

  pluginRegistry.removeHost("host-a");
  expect(getMarkdownBlockDelimiters()).toEqual([]);
});
```

Add to the file's imports:

```ts
import { getMarkdownBlockDelimiters } from "@/utils/split-markdown-blocks";
```

- [ ] **Step 7: Run the registry test to verify it fails**

Run: `npx vitest run packages/app/src/plugins/registry.test.ts --bail=1`
Expected: FAIL. Either the empty-plugin default lacks `markdownExtensions` (type error) or `getMarkdownBlockDelimiters()` is `[]` after install.

- [ ] **Step 8: Wire the registry**

In `packages/app/src/plugins/registry.ts`, add imports:

```ts
import { collectMarkdownBlockDelimiters } from "./markdown-extensions";
import { setMarkdownBlockDelimiters } from "@/utils/split-markdown-blocks";
```

In the empty-plugin default object (the literal containing `timelineRenderers: [],` near line 93), add:

```ts
          markdownExtensions: [],
```

Replace `publish` with:

```ts
  private publish(): void {
    this.snapshot = [...this.byHost.values()]
      .flat()
      .sort((left, right) =>
        `${left.serverId}/${left.id}`.localeCompare(`${right.serverId}/${right.id}`),
      );
    // The block splitter runs in the stream reducer and the height estimator, which cannot
    // subscribe to this registry, so push the delimiters instead of having them pull.
    setMarkdownBlockDelimiters(collectMarkdownBlockDelimiters(this.snapshot));
    for (const listener of this.listeners) listener();
  }
```

- [ ] **Step 9: Run both tests to verify they pass**

Run:

```bash
npx vitest run packages/app/src/plugins/registry.test.ts --bail=1
npx vitest run packages/app/src/plugins/evaluate.test.ts --bail=1
```

Expected: PASS.

- [ ] **Step 10: Typecheck, lint, format, commit**

```bash
npm run typecheck
npm run lint -- packages/app/src/plugins/types.ts packages/app/src/plugins/evaluate.ts packages/app/src/plugins/registry.ts packages/app/src/plugins/evaluate.test.ts packages/app/src/plugins/registry.test.ts
npm run format:files -- packages/app/src/plugins/types.ts packages/app/src/plugins/evaluate.ts packages/app/src/plugins/registry.ts packages/app/src/plugins/evaluate.test.ts packages/app/src/plugins/registry.test.ts
git add packages/app/src/plugins/types.ts packages/app/src/plugins/evaluate.ts packages/app/src/plugins/registry.ts packages/app/src/plugins/evaluate.test.ts packages/app/src/plugins/registry.test.ts
git commit -m "feat(app): register plugin markdown extensions and push block delimiters on publish"
```

---

### Task 6: Host UI exports and the markdown-source copy rule

**Files:**

- Create: `packages/app/src/plugins/react-native/markdown-source.tsx`
- Modify: `packages/app/src/plugins/react-native/runtime.ts`
- Modify: `packages/app/src/assistant-selection-copy/markup.ts`
- Modify: `packages/app/src/assistant-selection-copy/content.web.ts:23-52` (Turndown rules) and `:382-396` (`hasMarkdownContent`)
- Test: `packages/app/src/plugins/evaluate.test.ts`

**Interfaces:**

- Consumes: `MarkdownSourceProps` shape from Task 3.
- Produces: `MarkdownSource` component; `MARKDOWN_COPY_SOURCE_ATTRIBUTE = "data-paseo-markdown-source"`; `MARKDOWN_COPY_SOURCE_DATASET_KEY = "paseoMarkdownSource"`; `SvgXml` and `MarkdownSource` provided through `@getpaseo/plugin/client/react-native`.

- [ ] **Step 1: Write the failing provisioning test**

Append to `packages/app/src/plugins/evaluate.test.ts`, next to the `provides Paseo UI through @getpaseo/plugin/client/react-native` case:

```ts
it("provides SvgXml and MarkdownSource through @getpaseo/plugin/client/react-native", () => {
  const plugin = evaluatePluginClientBundle(
    "example",
    `(function(require) {
        const { SvgXml, MarkdownSource } = require("@getpaseo/plugin/client/react-native");
        const module = { exports: {} };
        module.exports.default = function(plugin) {
          if (typeof SvgXml !== "function" && typeof SvgXml !== "object") {
            throw new Error("SvgXml is not provided");
          }
          if (typeof MarkdownSource !== "function") {
            throw new Error("MarkdownSource is not provided");
          }
          plugin.addSurface("main", function Surface() { return null; });
          return function() {};
        };
        return module.exports;
      })`,
  );

  expect(plugin.surfaces.map((surface) => surface.id)).toEqual(["main"]);
});
```

`SvgXml` from react-native-svg is a function component; the `object` branch tolerates a memoized export.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/app/src/plugins/evaluate.test.ts --bail=1`
Expected: FAIL, `SvgXml is not provided`.

- [ ] **Step 3: Add the attribute constants**

In `packages/app/src/assistant-selection-copy/markup.ts`, add next to the other `MARKDOWN_COPY_*_ATTRIBUTE` constants:

```ts
/** An element carrying this copies as the attribute's value verbatim. */
export const MARKDOWN_COPY_SOURCE_ATTRIBUTE = "data-paseo-markdown-source";
/** react-native-web `dataSet` key that renders `MARKDOWN_COPY_SOURCE_ATTRIBUTE`. */
export const MARKDOWN_COPY_SOURCE_DATASET_KEY = "paseoMarkdownSource";
```

- [ ] **Step 4: Create `MarkdownSource`**

Create `packages/app/src/plugins/react-native/markdown-source.tsx`:

```tsx
import type { ReactNode } from "react";
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { MARKDOWN_COPY_SOURCE_DATASET_KEY } from "@/assistant-selection-copy/markup";

export interface MarkdownSourceProps {
  source: string;
  display?: boolean;
  style?: StyleProp<ViewStyle | TextStyle>;
  children: ReactNode;
}

// Inline content is a nested Text so react-native-web emits a span and the copy serializer
// keeps the surrounding spaces; a View would be a div, which Turndown treats as a block and
// strips the whitespace around. Display content wants exactly that block behavior.
export function MarkdownSource({ source, display = false, style, children }: MarkdownSourceProps) {
  const dataSet = { [MARKDOWN_COPY_SOURCE_DATASET_KEY]: source };
  if (display) {
    return (
      <View style={style as StyleProp<ViewStyle>} dataSet={dataSet} accessibilityLabel={source}>
        {children}
      </View>
    );
  }
  return (
    <Text style={style as StyleProp<TextStyle>} dataSet={dataSet} accessibilityLabel={source}>
      {children}
    </Text>
  );
}
```

`dataSet` is typed for `View` and `Text` by `packages/app/src/types/react-native-dataset.d.ts` and is ignored on native.

- [ ] **Step 5: Provide both through the host runtime**

Replace `packages/app/src/plugins/react-native/runtime.ts` with:

```ts
import { SvgXml } from "react-native-svg";
import { Icon } from "../icons";
import { Modal } from "./modal";
import { ScrollView, FlatList } from "./scroll-view";
import { TextInput } from "./text-input";
import { copyText } from "./clipboard";
import { useToast } from "./toast";
import { MarkdownSource } from "./markdown-source";
import { useRevealedText } from "@/hooks/use-revealed-text";

export const pluginReactNativeRuntime = {
  Icon,
  Modal,
  ScrollView,
  FlatList,
  TextInput,
  copyText,
  useRevealedText,
  useToast,
  SvgXml,
  MarkdownSource,
};
```

- [ ] **Step 6: Add the Turndown rule and the content check**

In `packages/app/src/assistant-selection-copy/content.web.ts`, add `MARKDOWN_COPY_SOURCE_ATTRIBUTE,` to the `./markup` import list. After the `compactListItem` rule, add:

```ts
turndown.addRule("declaredMarkdownSource", {
  // Non-text content such as a rendered formula declares the markdown it copies as.
  filter: (node) => node.hasAttribute(MARKDOWN_COPY_SOURCE_ATTRIBUTE),
  replacement: (_content, node) =>
    (node as HTMLElement).getAttribute(MARKDOWN_COPY_SOURCE_ATTRIBUTE) ?? "",
});
```

In `hasMarkdownContent`, replace the `visibleVoidSelector` construction so a selection holding only a declared-source element still counts as content:

```ts
const visibleVoidSelector = [
  ...["br", "hr"].map((tag) => `[${MARKDOWN_COPY_TAG_ATTRIBUTE}="${tag}"]`),
  `[${MARKDOWN_COPY_SOURCE_ATTRIBUTE}]`,
].join(",");
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run packages/app/src/plugins/evaluate.test.ts --bail=1`
Expected: PASS.

- [ ] **Step 8: Typecheck, lint, format, commit**

```bash
npm run typecheck
npm run lint -- packages/app/src/plugins/react-native/markdown-source.tsx packages/app/src/plugins/react-native/runtime.ts packages/app/src/assistant-selection-copy/markup.ts packages/app/src/assistant-selection-copy/content.web.ts packages/app/src/plugins/evaluate.test.ts
npm run format:files -- packages/app/src/plugins/react-native/markdown-source.tsx packages/app/src/plugins/react-native/runtime.ts packages/app/src/assistant-selection-copy/markup.ts packages/app/src/assistant-selection-copy/content.web.ts packages/app/src/plugins/evaluate.test.ts
git add packages/app/src/plugins/react-native/markdown-source.tsx packages/app/src/plugins/react-native/runtime.ts packages/app/src/assistant-selection-copy/markup.ts packages/app/src/assistant-selection-copy/content.web.ts packages/app/src/plugins/evaluate.test.ts
git commit -m "feat(app): provide SvgXml and MarkdownSource to plugins; copy declared markdown source verbatim"
```

The Turndown rule has no unit test here; the Playwright spec in Task 9 exercises it through a real selection and clipboard, which is the evidence bar `docs/qa.md` sets for web flows.

---

### Task 7: The `markdown-math` reference plugin

**Files:**

- Create: `plugin-examples/markdown-math/paseo-plugin.json`
- Create: `plugin-examples/markdown-math/index.client.tsx`
- Create: `plugin-examples/markdown-math/README.md`
- Move: `packages/app/src/utils/markdown-math.ts` → `plugin-examples/markdown-math/client/markdown-math.ts`
- Move: `packages/app/src/components/markdown/math-rules.tsx` → `plugin-examples/markdown-math/client/math-rules.tsx`
- Create: `plugin-examples/markdown-math/client/math-formula.tsx`
- Create: `plugin-examples/markdown-math/client/extension.ts`
- Modify: `packages/plugin/package.json` (devDependency `mathjax-full`)

**Interfaces:**

- Consumes: `SvgXml`, `MarkdownSource`, `PluginMarkdownExtension`, `PluginClientContext` from Task 3.
- Produces:
  - `MathFormulaProps { expression: string; source: string; displayMode: boolean; textStyle?: StyleProp<TextStyle> }`
  - `MathFormula: (props: MathFormulaProps) => JSX.Element`
  - `createMathMarkdownRules(Formula: ComponentType<MathFormulaProps>): RenderRules`
  - `MATH_BLOCK_DELIMITERS: PluginMarkdownBlockDelimiter[]`
  - `createMathExtension(Formula: ComponentType<MathFormulaProps>): PluginMarkdownExtension`
  - `markdownMath(markdown: MarkdownIt): void` (unchanged, now in the plugin)

Tests for this code live in `packages/app` (Task 8) because example tests do not run in CI.

- [ ] **Step 1: Move the two source files**

```bash
mkdir -p plugin-examples/markdown-math/client
git mv packages/app/src/utils/markdown-math.ts plugin-examples/markdown-math/client/markdown-math.ts
git mv packages/app/src/components/markdown/math-rules.tsx plugin-examples/markdown-math/client/math-rules.tsx
```

`markdown-math.ts` needs no edits: it imports only markdown-it types and keeps its own `findUnescapedDelimiter` and `isEscaped`.

- [ ] **Step 2: Turn the rules file into a factory**

Replace `plugin-examples/markdown-math/client/math-rules.tsx` with:

```tsx
import type { ComponentType, ReactNode } from "react";
import type { StyleProp, TextStyle } from "react-native";
import type { ASTNode, RenderRules } from "react-native-markdown-display";
import type { MathFormulaProps } from "./math-formula";

interface MathTextStyles {
  text?: StyleProp<TextStyle>;
}

function getMathFormulaProps(node: ASTNode): Omit<MathFormulaProps, "textStyle"> {
  const content = node.content ?? "";
  const sourceInfo = node.sourceInfo?.trim() ?? "";
  const fenceLanguage = sourceInfo.split(/\s+/, 1)[0]?.toLowerCase();
  const isMathFence =
    node.type === "math_block" &&
    fenceLanguage === "math" &&
    (node.markup.startsWith("`") || node.markup.startsWith("~"));

  if (isMathFence) {
    const terminatedContent = content.endsWith("\n") ? content : `${content}\n`;
    return {
      expression: content.trim(),
      source: `${node.markup}${sourceInfo}\n${terminatedContent}${node.markup}`,
      displayMode: true,
    };
  }

  let closingDelimiter = "$";
  if (node.markup === "\\(") {
    closingDelimiter = "\\)";
  } else if (node.markup === "\\[") {
    closingDelimiter = "\\]";
  } else if (node.markup === "$$") {
    closingDelimiter = "$$";
  }

  const displayMode = node.type === "math_block";
  const separator = node.type === "math_block" ? "\n" : "";
  return {
    expression: content,
    source: `${node.markup}${separator}${content}${separator}${closingDelimiter}`,
    displayMode,
  };
}

// Math tokens are leaf nodes, so the renderer hands them the ancestors' text styles as the
// fifth argument. That is the only place the prose color reaches them.
export function createMathMarkdownRules(
  Formula: ComponentType<MathFormulaProps>,
): Pick<RenderRules, "math_inline" | "math_block"> {
  const renderMathFormula = (
    node: ASTNode,
    _children: ReactNode[],
    _parent: ASTNode[],
    styles: MathTextStyles,
    inheritedStyles: TextStyle = {},
  ) => (
    <Formula
      key={node.key}
      {...getMathFormulaProps(node)}
      textStyle={[inheritedStyles, styles.text]}
    />
  );
  return { math_inline: renderMathFormula, math_block: renderMathFormula };
}
```

`ASTNode.sourceInfo` is declared by `packages/app/src/types/react-native-markdown-display.d.ts`, which the example cannot see. Add the same augmentation to the example so it typechecks from `packages/plugin`: create `plugin-examples/markdown-math/client/react-native-markdown-display.d.ts`:

```ts
// The runtime sets `sourceInfo` on fence nodes but the shipped .d.ts omits it.
export type { ASTNode } from "react-native-markdown-display";

declare module "react-native-markdown-display" {
  interface ASTNode {
    sourceInfo?: string;
  }
}
```

- [ ] **Step 3: Write the MathJax component**

Create `plugin-examples/markdown-math/client/math-formula.tsx`:

```tsx
import { MarkdownSource, SvgXml } from "@getpaseo/plugin/client/react-native";
import { useMemo } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";

export interface MathFormulaProps {
  expression: string;
  source: string;
  displayMode: boolean;
  textStyle?: StyleProp<TextStyle>;
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
// ponytail: base + ams only; switch to AllPackages when a user hits an unsupported macro.
const typesetter = mathjax.document("", {
  InputJax: new TeX({ packages: ["base", "ams", "newcommand", "noundefined"] }),
  // No glyph cache: every path is inline, so the SVG has no <defs>/<use> for the native
  // renderer to resolve.
  OutputJax: new SVG({ fontCache: "none" }),
});

// MathJax sizes its SVG in ex; one ex is about half the font size.
const EX_PER_FONT_SIZE = 0.5;
const DEFAULT_FONT_SIZE = 16;

interface RenderedSvg {
  xml: string;
  widthEx: number;
  heightEx: number;
}

function renderSvg(expression: string, displayMode: boolean): RenderedSvg | null {
  try {
    const container = typesetter.convert(expression, { display: displayMode });
    const svg = adaptor.firstChild(container);
    if (!svg) return null;
    const widthEx = Number.parseFloat(adaptor.getAttribute(svg, "width"));
    const heightEx = Number.parseFloat(adaptor.getAttribute(svg, "height"));
    if (!Number.isFinite(widthEx) || !Number.isFinite(heightEx)) return null;
    let xml = adaptor.outerHTML(svg);
    if (!xml.includes("currentColor")) {
      xml = xml.replace("<svg", '<svg fill="currentColor" stroke="currentColor"');
    }
    return { xml, widthEx, heightEx };
  } catch {
    return null;
  }
}

export function MathFormula({ expression, source, displayMode, textStyle }: MathFormulaProps) {
  const flat = StyleSheet.flatten(textStyle) ?? {};
  const fontSize = typeof flat.fontSize === "number" ? flat.fontSize : DEFAULT_FONT_SIZE;
  const color = typeof flat.color === "string" ? flat.color : undefined;
  const rendered = useMemo(() => renderSvg(expression, displayMode), [expression, displayMode]);

  if (!rendered) {
    return <Text style={textStyle}>{source}</Text>;
  }

  const width = rendered.widthEx * fontSize * EX_PER_FONT_SIZE;
  const height = rendered.heightEx * fontSize * EX_PER_FONT_SIZE;
  return (
    <MarkdownSource
      source={source}
      display={displayMode}
      style={displayMode ? styles.display : undefined}
    >
      <SvgXml xml={rendered.xml} width={width} height={height} color={color} />
    </MarkdownSource>
  );
}

const styles = StyleSheet.create({
  display: { alignItems: "center", marginVertical: 8 },
});
```

- [ ] **Step 4: Write the extension and the entry**

Create `plugin-examples/markdown-math/client/extension.ts`:

```ts
import type {
  PluginMarkdownBlockDelimiter,
  PluginMarkdownExtension,
} from "@getpaseo/plugin/client";
import type { ComponentType } from "react";
import { markdownMath } from "./markdown-math";
import type { MathFormulaProps } from "./math-formula";
import { createMathMarkdownRules } from "./math-rules";

export const MATH_BLOCK_DELIMITERS: PluginMarkdownBlockDelimiter[] = [
  { open: "$$", close: "$$" },
  { open: "\\[", close: "\\]" },
];

export function createMathExtension(
  Formula: ComponentType<MathFormulaProps>,
): PluginMarkdownExtension {
  return {
    id: "math",
    parser: markdownMath,
    rules: createMathMarkdownRules(Formula),
    blockDelimiters: MATH_BLOCK_DELIMITERS,
  };
}
```

Create `plugin-examples/markdown-math/index.client.tsx`:

```tsx
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createMathExtension } from "./client/extension";
import { MathFormula } from "./client/math-formula";

export default function contribute(client: PluginClientContext) {
  client.addMarkdownExtension(createMathExtension(MathFormula));
  return () => {};
}
```

Create `plugin-examples/markdown-math/paseo-plugin.json`:

```json
{
  "id": "markdown-math",
  "requirements": {
    "paseo": ">=0.8.0"
  }
}
```

- [ ] **Step 5: Add `mathjax-full` to the SDK package's devDependencies**

In `packages/plugin/package.json` `devDependencies`, add (alphabetical):

```json
    "mathjax-full": "^3.2.2",
```

Run: `npm install`
Expected: `node_modules/mathjax-full` present at the repo root.

- [ ] **Step 6: Verify MathJax emits `currentColor` and measure the bundle**

Run:

```bash
node -e '
const { mathjax } = require("mathjax-full/js/mathjax.js");
const { TeX } = require("mathjax-full/js/input/tex.js");
const { SVG } = require("mathjax-full/js/output/svg.js");
const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js");
const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js");
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document("", { InputJax: new TeX(), OutputJax: new SVG({ fontCache: "none" }) });
const svg = adaptor.outerHTML(adaptor.firstChild(doc.convert("E = mc^2", { display: false })));
console.log("currentColor:", svg.includes("currentColor"));
console.log("uses <use>:", svg.includes("<use"));
console.log(svg.slice(0, 160));
'
```

Expected: `currentColor: true` and `uses <use>: false`. If `currentColor` prints `false`, the fallback in `renderSvg` covers it; record the observed value in the README.

Run:

```bash
npx esbuild plugin-examples/markdown-math/index.client.tsx --bundle --format=cjs --platform=neutral --target=es2020 --minify \
  --external:react --external:react/jsx-runtime --external:react-native --external:zod --external:@tanstack/react-query \
  '--external:@getpaseo/plugin*' --outfile=/tmp/markdown-math.client.js && wc -c /tmp/markdown-math.client.js
```

Expected: a byte count. Record it in the README.

- [ ] **Step 7: Write the README**

Create `plugin-examples/markdown-math/README.md`, filling in the two measured values:

```markdown
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

Measured on this checkout: client bundle <BYTES> bytes minified; MathJax SVG emits
`currentColor` = <true|false>.
```

Replace `<BYTES>` and `<true|false>` with the values from Step 6 before committing.

- [ ] **Step 8: Typecheck the example and the SDK, lint, format, commit**

```bash
npm run typecheck --workspace=@getpaseo/plugin
npm run lint -- plugin-examples/markdown-math
npm run format:files -- plugin-examples/markdown-math packages/plugin/package.json
git add plugin-examples/markdown-math packages/plugin/package.json package-lock.json
git commit -m "feat(plugin-examples): markdown-math renders LaTeX through addMarkdownExtension and SvgXml"
```

`packages/app` does not typecheck yet: `message.tsx` still imports the moved files. Task 8 fixes that.

---

### Task 8: Assistant message wiring, patch removal, and host tests

**Files:**

- Modify: `packages/app/src/components/message.tsx:59`, `:70`, `:1503`, `:1523-1524`, `:1735`, `:1950-1951`
- Delete: `packages/app/src/components/math-formula.web.tsx`, `math-formula.native.tsx`, `math-formula.d.ts`, `math-formula.browser.test.tsx`
- Modify: `packages/app/package.json:105` (remove `katex`)
- Modify: `packages/app/src/utils/markdown-math.test.ts:3` (import path)
- Modify: `packages/app/src/components/markdown/math-rules.test.tsx` (whole file replaced)

**Interfaces:**

- Consumes: Task 4's four functions; `useInstalledPlugins` from `@/plugins/registry`; `createMathExtension`, `MathFormulaProps`, `markdownMath` from the example.
- Produces: `AssistantMessage` applies installed extensions; the fork's KaTeX path is gone.

- [ ] **Step 1: Rewrite `markdown-math.test.ts` to import the shipped source**

In `packages/app/src/utils/markdown-math.test.ts`, replace line 3:

```ts
import { markdownMath } from "../../../../plugin-examples/markdown-math/client/markdown-math";
```

Everything else in the file stays.

- [ ] **Step 2: Rewrite `math-rules.test.tsx` as a host wiring test**

Replace `packages/app/src/components/markdown/math-rules.test.tsx` with:

```tsx
import {
  createElement,
  Fragment,
  isValidElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import AstRenderer from "react-native-markdown-display/src/lib/AstRenderer";
import parser from "react-native-markdown-display/src/lib/parser";
import { describe, expect, it } from "vitest";
import { createMathExtension } from "../../../../../plugin-examples/markdown-math/client/extension";
import type { MathFormulaProps } from "../../../../../plugin-examples/markdown-math/client/math-formula";
import {
  applyMarkdownExtensionParsers,
  mergeMarkdownExtensionRules,
} from "@/plugins/markdown-extensions";
import { createAssistantMarkdownParser } from "@/utils/assistant-markdown-parser";
import { createMarkdownStyles } from "@/styles/markdown-styles";
import { darkTheme, lightTheme, type Theme } from "@/styles/theme";

// The real component pulls in MathJax; the wiring under test is parser + rules + styles.
const StubFormula: ComponentType<MathFormulaProps> = () => null;
const extension = createMathExtension(StubFormula);

function collectFormulaColors(markdown: string, theme: Theme = darkTheme): (string | undefined)[] {
  const styles = createMarkdownStyles(theme);
  const passThrough = (node: { key: string }, children: ReactNode[]) =>
    createElement(Fragment, { key: node.key }, children);
  const rules = mergeMarkdownExtensionRules(
    {
      body: passThrough,
      paragraph: passThrough,
      textgroup: passThrough,
      blockquote: passThrough,
      text: () => null,
    },
    [extension],
  );
  const renderer = new AstRenderer(rules, styles);
  const markdownIt = applyMarkdownExtensionParsers(createAssistantMarkdownParser(), [extension]);
  const tree = parser(markdown, renderer.render, markdownIt);

  const colors: (string | undefined)[] = [];
  const walk = (node: ReactNode) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!isValidElement(node)) {
      return;
    }
    const element = node as ReactElement<{
      textStyle?: StyleProp<TextStyle>;
      children?: ReactNode;
    }>;
    if (element.type === StubFormula) {
      colors.push(StyleSheet.flatten(element.props.textStyle)?.color as string | undefined);
      return;
    }
    walk(element.props.children);
  };
  walk(tree);
  return colors;
}

const colorOf = (style: StyleProp<TextStyle>) => StyleSheet.flatten(style)?.color;

describe.each<[string, Theme]>([
  ["dark", darkTheme],
  ["light", lightTheme],
])("markdown-math extension through the host (%s theme)", (_name, theme) => {
  it("gives formulas the same color as the prose around them", () => {
    const styles = createMarkdownStyles(theme);
    const colors = collectFormulaColors("Inline $E = mc^2$ and display:\n\n$$E = mc^2$$\n", theme);

    expect(colors).toEqual([colorOf(styles.body), colorOf(styles.body)]);
  });

  it("follows a blockquote's color override when nested in one", () => {
    const styles = createMarkdownStyles(theme);
    const colors = collectFormulaColors("> $E = mc^2$\n", theme);

    expect(colors).toEqual([colorOf(styles.blockquote) ?? colorOf(styles.body)]);
  });
});

describe("markdown-math extension through the host", () => {
  it("uses a different color in each theme, so formulas stay legible on either background", () => {
    const dark = collectFormulaColors("$E = mc^2$\n", darkTheme);
    const light = collectFormulaColors("$E = mc^2$\n", lightTheme);

    expect(dark[0]).toBe(darkTheme.colors.foreground);
    expect(light[0]).toBe(lightTheme.colors.foreground);
    expect(dark[0]).not.toBe(light[0]);
  });

  it("declares the display delimiters the splitter protects", () => {
    expect(extension.blockDelimiters).toEqual([
      { open: "$$", close: "$$" },
      { open: "\\[", close: "\\]" },
    ]);
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run:

```bash
npx vitest run packages/app/src/utils/markdown-math.test.ts --bail=1
npx vitest run packages/app/src/components/markdown/math-rules.test.tsx --bail=1
```

Expected: the first PASSES already (pure parser, path only). The second FAILS: `mergeMarkdownExtensionRules` exists, but `@/components/math-formula` no longer resolves for anything that still imports it, and `message.tsx` is broken. Continue.

- [ ] **Step 4: Rewire `AssistantMessage`**

In `packages/app/src/components/message.tsx`:

Delete these two import lines:

```ts
import { mathMarkdownRules } from "@/components/markdown/math-rules";
import { markdownMath } from "@/utils/markdown-math";
```

Add these imports next to the other `@/plugins` or `@/utils` imports:

```ts
import { useInstalledPlugins } from "@/plugins/registry";
import {
  applyMarkdownExtensionParsers,
  collectMarkdownExtensions,
  mergeMarkdownExtensionRules,
} from "@/plugins/markdown-extensions";
```

Replace this line:

```ts
const markdownParser = useMemo(() => createAssistantMarkdownParser().use(markdownMath), []);
```

with:

```ts
const installedPlugins = useInstalledPlugins();
const markdownExtensions = useMemo(
  () => collectMarkdownExtensions(installedPlugins),
  [installedPlugins],
);
const markdownParser = useMemo(
  () => applyMarkdownExtensionParsers(createAssistantMarkdownParser(), markdownExtensions),
  [markdownExtensions],
);
```

In the rules `useMemo` that starts `const markdownRules = useMemo<RenderRules>(() => {`, change its first body line from `return {` to:

```ts
    return mergeMarkdownExtensionRules({
```

Delete the line `      ...mathMarkdownRules,` inside that object.

Change the object's closing from

```ts
    };
  }, [client, fileLinkActions, markdownParser, occurrenceKey, phase, serverId, workspaceRoot]);
```

to

```ts
    }, markdownExtensions);
  }, [
    client,
    fileLinkActions,
    markdownExtensions,
    markdownParser,
    occurrenceKey,
    phase,
    serverId,
    workspaceRoot,
  ]);
```

- [ ] **Step 5: Delete the KaTeX files and dependency**

```bash
git rm packages/app/src/components/math-formula.web.tsx packages/app/src/components/math-formula.native.tsx packages/app/src/components/math-formula.d.ts packages/app/src/components/math-formula.browser.test.tsx
npm uninstall katex --workspace=@getpaseo/app
```

Confirm `rg -n "katex" packages/app/package.json packages/app/src` prints nothing.

- [ ] **Step 6: Run the tests to verify they pass**

Run:

```bash
npx vitest run packages/app/src/components/markdown/math-rules.test.tsx --bail=1
npx vitest run packages/app/src/utils/markdown-math.test.ts --bail=1
npx vitest run packages/app/src/plugins/markdown-extensions.test.ts --bail=1
```

Expected: PASS.

- [ ] **Step 7: Typecheck, lint, format, commit**

```bash
npm run typecheck
npm run lint -- packages/app/src/components/message.tsx packages/app/src/utils/markdown-math.test.ts packages/app/src/components/markdown/math-rules.test.tsx
npm run format:files -- packages/app/src/components/message.tsx packages/app/src/utils/markdown-math.test.ts packages/app/src/components/markdown/math-rules.test.tsx
git add -A packages/app/src/components packages/app/src/utils packages/app/package.json package-lock.json
git commit -m "feat(app): render assistant markdown through plugin extensions; drop the built-in KaTeX patch"
```

---

### Task 9: Web proof, and the mobile smoke scripts

**Files:**

- Create: `packages/app/e2e/browser/plugin-markdown-math.spec.ts`
- Create: `packages/app/e2e/mobile/agent-device/markdown-math.ios.ad`
- Create: `packages/app/e2e/mobile/agent-device/markdown-math.android.ad`

**Interfaces:**

- Consumes: the example plugin directory from Task 7; `seedMockAgentWorkspace`, `openAgentRoute` from `../support/helpers/mock-agent`; `pluginRequirements` from `../support/helpers/plugin-fixture`; `connectNewWorkspaceDaemonClient` from `../support/helpers/new-workspace`.

- [ ] **Step 1: Write the Playwright spec**

Create `packages/app/e2e/browser/plugin-markdown-math.spec.ts`:

```ts
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { connectNewWorkspaceDaemonClient } from "../support/helpers/new-workspace";
import { pluginRequirements } from "../support/helpers/plugin-fixture";

const PLUGIN_ID = "markdown-math";
const EXAMPLE_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../plugin-examples/markdown-math",
);
const INLINE_SOURCE = "$E = mc^2$";
const RESPONSE = `Energy is ${INLINE_SOURCE} here.\n\n$$\nx^2\n\ny^2\n$$\n\nDone.`;

async function selectAssistantMessage(page: Page): Promise<void> {
  await page
    .getByTestId("assistant-message")
    .last()
    .evaluate((element) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
}

async function copySelection(page: Page): Promise<string> {
  await page.keyboard.press("ControlOrMeta+c");
  return page.evaluate(() => navigator.clipboard.readText());
}

async function allowClipboard(context: BrowserContext): Promise<void> {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
}

test("renders LaTeX through the markdown-math plugin and copies its source", async ({
  page,
  context,
}, testInfo) => {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-markdown-math-e2e-"));
  await cp(EXAMPLE_DIRECTORY, directory, { recursive: true });
  await writeFile(
    path.join(directory, "paseo-plugin.json"),
    JSON.stringify({ id: PLUGIN_ID, requirements: pluginRequirements }),
  );

  const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
  const previousConfig = await client.getDaemonConfig();
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "plugin-markdown-math-",
    title: "Markdown math",
    initialPrompt: "Render the configured math response.",
    featureValues: { mockAssistantResponse: RESPONSE },
  });

  try {
    await client.patchDaemonConfig({ pluginsEnabled: true });
    await client.installDirectoryPlugin(directory);
    await agent.client.waitForFinish(agent.agentId, 30_000);
    await openAgentRoute(page, agent);

    const assistantMessage = page.getByTestId("assistant-message").last();
    await expect(assistantMessage).toBeVisible({ timeout: 30_000 });

    await test.step("inline and display formulas render as SVG with no literal delimiters", async () => {
      await expect(assistantMessage.locator("svg")).toHaveCount(2, { timeout: 30_000 });
      await expect(assistantMessage).toContainText("Energy is");
      await expect(assistantMessage).not.toContainText(INLINE_SOURCE);
      await expect(assistantMessage).not.toContainText("$$");
      await page.screenshot({
        path: testInfo.outputPath("plugin-markdown-math-rendered.png"),
        fullPage: true,
      });
    });

    await test.step("a drag selection copies the LaTeX source with its spacing", async () => {
      await allowClipboard(context);
      await selectAssistantMessage(page);
      const copied = await copySelection(page);
      expect(copied).toContain(`Energy is ${INLINE_SOURCE} here.`);
      expect(copied).toContain("$$\nx^2\n\ny^2\n$$");
    });

    await test.step("removing the plugin restores the literal text", async () => {
      await client.removePlugin(PLUGIN_ID);
      await expect(assistantMessage).toContainText(INLINE_SOURCE, { timeout: 30_000 });
      await expect(assistantMessage.locator("svg")).toHaveCount(0);
    });
  } finally {
    await client.removePlugin(PLUGIN_ID).catch(() => undefined);
    await client
      .patchDaemonConfig({ pluginsEnabled: previousConfig.config.pluginsEnabled ?? false })
      .catch(() => undefined);
    await client.close().catch(() => undefined);
    await agent.cleanup().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});
```

The response's `$$` block carries an interior blank line on purpose: it proves the splitter's declared-delimiter protection through the real stream path, not only the unit test.

- [ ] **Step 2: Run the spec**

Run: `npx playwright test packages/app/e2e/browser/plugin-markdown-math.spec.ts --workers=1`
Expected: PASS, with `plugin-markdown-math-rendered.png` in the test output directory.

If the copy step fails with the inline text missing its surrounding spaces, `MarkdownSource` rendered a `div` for inline content; confirm it is rendered inside the paragraph's `Text` run so react-native-web emits a `span`.

- [ ] **Step 3: Write the mobile smoke scripts**

Create `packages/app/e2e/mobile/agent-device/markdown-math.ios.ad`:

```
context platform=ios timeout=60000 retries=1
env APP_ID=sh.paseo.debug

open "${APP_ID}"
wait "text" "Energy is" 20000
close
```

Create `packages/app/e2e/mobile/agent-device/markdown-math.android.ad` with the same body and `context platform=android timeout=60000 retries=1`.

These assert only that the seeded reply's prose is on screen; Agent Device has no negative text assertion, so the absence of the literal `$` is confirmed by the screenshot the runner saves under `.dev/agent-device-artifacts`. The app must already be showing an agent whose last reply is the `RESPONSE` text above; Step 4 seeds it.

- [ ] **Step 4: Verify on the Mac (user-run)**

This step runs on the Mac, against this checkout's dev daemon. Ask the user before the first command; it edits `.dev/paseo-home/config.json`.

```bash
# 1. Dev daemon and plugin (once). Ask before setting pluginsEnabled.
npm run dev:server
node -e 'const fs=require("fs");const p=".dev/paseo-home/config.json";const c=JSON.parse(fs.readFileSync(p,"utf8"));c.pluginsEnabled=true;fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n");'
npm run cli -- reload --json
npm run cli -- plugin install "$PWD/plugin-examples/markdown-math"
npm run cli -- plugin ls          # expect markdown-math: running

# 2. iOS simulator against the dev daemon
EXPO_PUBLIC_LOCAL_DAEMON=localhost:6768 npm run ios

# 3. Android emulator against the dev daemon
REACT_NATIVE_PACKAGER_HOSTNAME=10.0.2.2 EXPO_PUBLIC_LOCAL_DAEMON=10.0.2.2:6768 npm run android
```

In each app, open any agent and send: `Reply with exactly: Energy is $E = mc^2$ here. Then a display block $$ x^2 $$`. Screenshot the rendered reply in light and dark themes. Then run the smoke scripts:

```bash
npm run test:e2e:mobile
```

Expected: both `markdown-math.*.ad` scripts pass; screenshots show typeset formulas and no literal `$`.

- [ ] **Step 5: Lint, format, commit**

```bash
npm run lint -- packages/app/e2e/browser/plugin-markdown-math.spec.ts
npm run format:files -- packages/app/e2e/browser/plugin-markdown-math.spec.ts
git add packages/app/e2e/browser/plugin-markdown-math.spec.ts packages/app/e2e/mobile/agent-device/markdown-math.ios.ad packages/app/e2e/mobile/agent-device/markdown-math.android.ad
git commit -m "test(app): prove markdown-math rendering, streaming protection, and copy through a real browser"
```

---

### Task 10: Documentation and the retirement ledger

**Files:**

- Modify: `public-docs/plugins/v0.8/reference.md` (after the Icons table at `:808`; before `## Contribute a theme` at `:926`)
- Modify: `docs/plugins.md` (after the `## Contribute timeline items` section)
- Modify: `docs/agent-stream-performance.md` (`## Invariants`)
- Modify: `docs/fork-retirement.md` (`## LaTeX assistant-message rendering`)

- [ ] **Step 1: Reference, host UI**

In `public-docs/plugins/v0.8/reference.md`, after the `### Icons` table and before `## Timeline items`, add:

```markdown
### SVG and markdown source

`SvgXml` renders an SVG document string on every platform. It is the only vector-drawing
primitive plugins get; plugin bundles still do not import `react-native-svg`.

| Prop     | Type               | Required | Behavior                                     |
| -------- | ------------------ | -------- | -------------------------------------------- |
| `xml`    | `string \| null`   | Yes      | The SVG document. `null` renders nothing.    |
| `width`  | `number \| string` | No       | Rendered width.                              |
| `height` | `number \| string` | No       | Rendered height.                             |
| `color`  | `string`           | No       | Value of `currentColor` inside the document. |

`MarkdownSource` wraps content that has no text of its own, such as a rendered formula, and
declares the markdown it copies as. A web drag selection that includes the wrapper copies
`source` verbatim; the turn copy button is unaffected because it copies the raw message.

| Prop       | Type        | Required | Behavior                                                    |
| ---------- | ----------- | -------- | ----------------------------------------------------------- |
| `source`   | `string`    | Yes      | Copied in place of the children.                            |
| `display`  | `boolean`   | No       | `true` renders a block; default renders an inline text run. |
| `style`    | style       | No       | Applied to the wrapper.                                     |
| `children` | `ReactNode` | Yes      | What the user sees.                                         |
```

- [ ] **Step 2: Reference, markdown extensions**

Before `## Contribute a theme`, add:

````markdown
## Markdown extensions

`addMarkdownExtension` extends how Paseo parses and renders assistant messages. The assistant
row stays Paseo's; the extension adds token types, render rules, and block delimiters.

```ts
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { markdownMath } from "./client/markdown-math";
import { createMathMarkdownRules } from "./client/math-rules";
import { MathFormula } from "./client/math-formula";

export default function contribute(client: PluginClientContext) {
  client.addMarkdownExtension({
    id: "math",
    parser: markdownMath,
    rules: createMathMarkdownRules(MathFormula),
    blockDelimiters: [
      { open: "$$", close: "$$" },
      { open: "\\[", close: "\\]" },
    ],
  });
  return () => {};
}
```

| Field             | Type                                | Required | Behavior                                                                                 |
| ----------------- | ----------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `id`              | `string`                            | Yes      | Unique per plugin. A duplicate throws.                                                   |
| `parser`          | `(markdown: MarkdownIt) => void`    | No       | Applied with `use()` each time the assistant parser is built. A throw fails that build.  |
| `rules`           | `RenderRules`                       | No       | Merged after Paseo's rules, so an extension rule wins on collision.                      |
| `blockDelimiters` | `{ open: string; close: string }[]` | No       | Line-leading pairs the streaming splitter keeps in one block, closed or still streaming. |

`parser` receives Paseo's live `markdown-it` instance, typed by `@types/markdown-it`. `rules` use
`react-native-markdown-display`'s `RenderRules`; a leaf rule receives the inherited text style as
its fifth argument, which is how prose color reaches a rendered token.

`blockDelimiters` matter during streaming. Paseo splits a message into render blocks before any
parser runs, so a `$$` block that has not closed yet would otherwise be split at its first blank
line. A declared pair is matched at the start of a line, after any blockquote or list prefix, and
holds every following line until an unescaped `close` appears or the text ends.

A client that predates this capability reports `client.addMarkdownExtension is not a function`;
set `requirements.paseo` to the first release that ships it. See `plugin-examples/markdown-math`.
````

- [ ] **Step 3: Maintainer doc**

In `docs/plugins.md`, immediately before the `## ` heading that follows the `## Contribute timeline items` section (find it with `rg -n "^## " docs/plugins.md`), add:

```markdown
## Contribute markdown extensions

`addMarkdownExtension` is the client contribution for assistant markdown: a markdown-it plugin,
render rules merged after the built-ins, and block delimiters the streaming splitter protects.
`packages/app/src/plugins/markdown-extensions.ts` composes installed extensions; `AssistantMessage`
applies them, and `PluginRegistry.publish()` pushes the delimiters into
`packages/app/src/utils/split-markdown-blocks.ts` because the splitter also runs in the stream
reducer and the height estimator, where no hook is available. `MarkdownSource` in
`packages/app/src/plugins/react-native/markdown-source.tsx` is how non-text content copies as
markdown on web. See the [public reference](../public-docs/plugins/v0.8/reference.md#markdown-extensions)
and `plugin-examples/markdown-math`.
```

- [ ] **Step 4: Stream invariant**

In `docs/agent-stream-performance.md` under `## Invariants`, add a bullet:

```markdown
- **A render block never splits inside an open fence or an open extension-declared pair.** The
  splitter runs before any parser, and markdown-it emits no token for an unclosed fence or a
  streaming `$$` block, so the splitter tracks them itself. Plugins declare pairs through
  `addMarkdownExtension`'s `blockDelimiters`; the registry pushes the current list into
  `split-markdown-blocks.ts` on every publish. An unclosed region runs to the end of the text.
```

- [ ] **Step 5: Retirement ledger**

In `docs/fork-retirement.md`, under `## LaTeX assistant-message rendering`, in the `Fork evidence:` list, add a bullet (fill the PR number after Task 11 opens it):

```markdown
- [ZGEnergy/paseo#<number>](https://github.com/ZGEnergy/paseo/pull/<number>): replaces the built-in
  patch with `addMarkdownExtension`, `SvgXml`, and `MarkdownSource` in the plugin SDK plus the
  `markdown-math` example. Native now typesets. Retirement runs through the upstream SDK PR, not
  the closed getpaseo/paseo#2562.
```

Leave the `Upstream `main` provides the full behavior` box unchecked and the status `waiting`.

- [ ] **Step 6: Format and commit**

```bash
npm run format:files -- public-docs/plugins/v0.8/reference.md docs/plugins.md docs/agent-stream-performance.md docs/fork-retirement.md
git add public-docs/plugins/v0.8/reference.md docs/plugins.md docs/agent-stream-performance.md docs/fork-retirement.md
git commit -m "docs: markdown extensions, SvgXml, MarkdownSource, and the LaTeX retirement path"
```

---

### Task 11: Track B, the fork pull request

**Files:** none new.

- [ ] **Step 1: Final local checks and the Nix hash**

```bash
npm run format
npm run lint
npm run typecheck
./scripts/update-nix.sh
git status --short
```

`update-nix.sh` refreshes `nix/npm-deps.hash` for the changed lockfile; it needs Nix installed, as `docs/onboarding.md` requires. Commit whatever it changes:

```bash
git add nix/npm-deps.hash
git commit -m "chore: refresh npm deps hash"
```

- [ ] **Step 2: Push and open the pull request**

```bash
git push -u origin HEAD
gh pr create --base internal/main \
  --title "Plugin SDK: markdown extensions, SvgXml, MarkdownSource; markdown-math example replaces the KaTeX patch" \
  --body "$(cat <<'EOF'
Downstream feature: true
Downstream rationale: mobile users run upstream's app, so LaTeX has to ship as a plugin; this adds the smallest SDK surface that makes that possible and makes the fork its first consumer.

## Evidence

Platform matrix and commands per docs/qa.md:

| Platform        | Tested | Notes |
| --------------- | ------ | ----- |
| iOS             |        |       |
| Android         |        |       |
| Web             |        |       |
| Desktop macOS   |        |       |
| Desktop Linux   |        |       |

- Boundaries and loaders: boundaries.test.ts, compiler.test.ts, plugin-process.test.ts, evaluate.test.ts, registry.test.ts (paste output)
- Splitter: split-markdown-blocks.test.ts, 24 tests (paste output)
- Web: plugin-markdown-math.spec.ts (attach plugin-markdown-math-rendered.png)
- iOS / Android: markdown-math.ios.ad, markdown-math.android.ad (attach screenshots, light and dark)
- Desktop: screenshots from npm run dev:desktop, light and dark
EOF
)"
```

Fill the matrix and paste outputs into the PR body before review. Then put the PR number into `docs/fork-retirement.md` (Task 10 Step 5), commit, and push.

- [ ] **Step 3: Ship**

Run `/ship`. It requires CI and provenance green for the head, runs the review agent, and stops on a high-risk finding. Steps 6 and 7 of the ship skill do not apply; this is a downstream feature, not an import. Confirm the merge commit on `internal/main`.

---

### Task 12: Track A, the upstream candidate

**Files:** none new. Runs after Task 11's PR has merged.

- [ ] **Step 1: Create the candidate from upstream main**

```bash
git fetch origin main internal/main
git checkout -b markdown-extension-sdk-upstream origin/main
```

- [ ] **Step 2: Commit 1, the fence fix, from the recorded file state**

```bash
git checkout "$SPLITTER_FENCE_SHA" -- packages/app/src/utils/split-markdown-blocks.ts packages/app/src/utils/__tests__/split-markdown-blocks.test.ts
git commit -m "fix(app): keep an unclosed streaming code fence in one markdown block"
```

- [ ] **Step 3: Commit 2, everything else, from the merged fork tree**

```bash
git checkout origin/internal/main -- \
  packages/plugin/src/client/contracts.ts \
  packages/plugin/src/client/index.ts \
  packages/plugin/src/client/react-native.ts \
  packages/plugin/package.json \
  packages/app/src/plugins/markdown-extensions.ts \
  packages/app/src/plugins/markdown-extensions.test.ts \
  packages/app/src/plugins/types.ts \
  packages/app/src/plugins/evaluate.ts \
  packages/app/src/plugins/evaluate.test.ts \
  packages/app/src/plugins/registry.ts \
  packages/app/src/plugins/registry.test.ts \
  packages/app/src/plugins/react-native/markdown-source.tsx \
  packages/app/src/plugins/react-native/runtime.ts \
  packages/app/src/assistant-selection-copy/markup.ts \
  packages/app/src/assistant-selection-copy/content.web.ts \
  packages/app/src/components/message.tsx \
  packages/app/src/utils/split-markdown-blocks.ts \
  packages/app/src/utils/__tests__/split-markdown-blocks.test.ts \
  packages/app/src/utils/markdown-math.test.ts \
  packages/app/src/components/markdown/math-rules.test.tsx \
  packages/app/src/types/react-native-markdown-display-internals.d.ts \
  packages/app/e2e/browser/plugin-markdown-math.spec.ts \
  packages/app/e2e/mobile/agent-device/markdown-math.ios.ad \
  packages/app/e2e/mobile/agent-device/markdown-math.android.ad \
  plugin-examples/markdown-math \
  public-docs/plugins/v0.8/reference.md \
  docs/plugins.md \
  docs/agent-stream-performance.md
npm install
git add -A
git commit -m "feat(plugin): addMarkdownExtension, SvgXml, and MarkdownSource; markdown-math example"
```

`npm install` regenerates `package-lock.json` for the new SDK devDependencies against upstream's lock. `packages/app/package.json`, `docs/fork-retirement.md`, and `nix/` are deliberately absent: upstream never had `katex`, the ledger is fork-only, and the Nix hash is fork-derived.

- [ ] **Step 4: Preflight**

```bash
node scripts/check-upstream-port.mjs --candidate HEAD --upstream-ref origin/main \
  --integration-ref origin/internal/main \
  --allow-path packages/plugin \
  --allow-path packages/app/src/plugins \
  --allow-path packages/app/src/assistant-selection-copy \
  --allow-path packages/app/src/components/message.tsx \
  --allow-path packages/app/src/components/markdown/math-rules.test.tsx \
  --allow-path packages/app/src/utils/split-markdown-blocks.ts \
  --allow-path packages/app/src/utils/__tests__/split-markdown-blocks.test.ts \
  --allow-path packages/app/src/utils/markdown-math.test.ts \
  --allow-path packages/app/src/types/react-native-markdown-display-internals.d.ts \
  --allow-path packages/app/e2e/browser/plugin-markdown-math.spec.ts \
  --allow-path packages/app/e2e/mobile/agent-device \
  --allow-path plugin-examples/markdown-math \
  --allow-path public-docs/plugins \
  --allow-path docs/plugins.md \
  --allow-path docs/agent-stream-performance.md \
  --allow-path package-lock.json
```

Expected: exit 0. A `changed path outside allowed scope` error names a file that must not be in the candidate; remove it and re-run.

- [ ] **Step 5: Smoke the candidate**

```bash
npm run build --workspace=@getpaseo/plugin
npx vitest run packages/plugin/src/boundaries.test.ts --bail=1
npx vitest run packages/app/src/plugins/evaluate.test.ts --bail=1
npx vitest run packages/app/src/utils/__tests__/split-markdown-blocks.test.ts --bail=1
npm run typecheck
npx playwright test packages/app/e2e/browser/plugin-markdown-math.spec.ts --workers=1
```

Expected: all PASS on a tree that has no KaTeX code.

- [ ] **Step 6: Open the upstream pull request**

```bash
git push -u origin markdown-extension-sdk-upstream
gh pr create --repo getpaseo/paseo --base main \
  --title "Plugin SDK: markdown extensions, SvgXml, and MarkdownSource" \
  --body "$(cat <<'EOF'
getpaseo/paseo#2562 was closed in favor of timeline plugins handling math. This is the smallest SDK surface that makes that possible, with the LaTeX plugin as the proof.

- Commit 1 stands alone: an unclosed streaming code fence no longer splits into two render blocks.
- Commit 2 adds `client.addMarkdownExtension({ id, parser, rules, blockDelimiters })`, exports `SvgXml` and `MarkdownSource` from `@getpaseo/plugin/client/react-native`, and adds `plugin-examples/markdown-math`.

No new host module specifier, no compiler or scaffold change, no protocol change. Evidence attached from a fork tree without any built-in math code: [paste from the fork PR].
EOF
)"
```

---

## Self-review

**Spec coverage.** Contract and semantics: Task 3, Task 5. Block protection, two commits: Tasks 1, 2, and the registry push in Task 5. `SvgXml`: Tasks 3, 6. Copy: Task 6 (`MarkdownSource`, Turndown rule) and Task 9's copy step. Reference plugin: Task 7. `AssistantMessage` wiring and patch removal: Task 8. Verification matrix: Task 9 and the PR body in Task 11. Tests: Tasks 1, 2, 4, 5, 6, 8, 9. Docs: Task 10. Track B and Track A: Tasks 11, 12. The spec's Copy and selection, Capability 2, Block protection, Host wiring, and Line budget sections were revised to match this plan before either was committed.

**Placeholder scan.** The only bracketed values are the README's two measured numbers (filled in Task 7 Step 7 from Step 6's output), the PR number in the ledger (filled in Task 11 Step 2 from `gh pr create`), and the evidence paste in the upstream PR body. Each names the step that produces it.

**Type consistency.** `MarkdownBlockDelimiter` (Task 2) and `PluginMarkdownBlockDelimiter` (Task 3) are structurally identical; `collectMarkdownBlockDelimiters` returns the former from the latter. `MathFormulaProps` is defined once in Task 7's `math-formula.tsx` and imported as a type by `math-rules.tsx`, `extension.ts`, and Task 8's test. `createMathExtension` and `createMathMarkdownRules` take `ComponentType<MathFormulaProps>` everywhere. `setMarkdownBlockDelimiters` / `getMarkdownBlockDelimiters` names match across Tasks 2, 5, and the registry test.
