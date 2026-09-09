import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { connectNewWorkspaceDaemonClient } from "../support/helpers/new-workspace";
import { pluginRequirements } from "../support/helpers/plugin-fixture";

const PLUGIN_ID = "markdown-math";
// __dirname (not import.meta.url) matches plugin-fixture.ts's copyPluginExample — this harness's
// TS transform runs specs as CommonJS, so a top-level import.meta.url forces ESM loading instead
// and throws "require is not defined in ES module scope".
const EXAMPLE_DIRECTORY = path.resolve(__dirname, "../../../../plugin-examples/markdown-math");
const REPO_ROOT_NODE_MODULES = path.resolve(EXAMPLE_DIRECTORY, "../../node_modules");
// The example plugin ships no package.json of its own; it leans on this monorepo's hoisted
// node_modules for markdown-it, mathjax-full, and react-native-markdown-display, which resolve
// fine when the plugin installs from its real in-repo path. Every other plugin fixture in this
// suite copies into an OS temp dir for isolation, which breaks that ancestor node_modules walk
// for a plugin with real npm dependencies. Symlinking the packages the temp copy needs mirrors
// what a real consumer's `npm install` would produce, without touching the plugin's own source.
const VENDORED_PACKAGES = [
  "markdown-it",
  "@types/markdown-it",
  "mathjax-full",
  "react-native-markdown-display",
];

async function vendorPluginDependencies(directory: string): Promise<void> {
  const nodeModules = path.join(directory, "node_modules");
  await mkdir(path.join(nodeModules, "@types"), { recursive: true });
  for (const name of VENDORED_PACKAGES) {
    await symlink(path.join(REPO_ROOT_NODE_MODULES, name), path.join(nodeModules, name), "dir");
  }
}

const INLINE_SOURCE = "$E = mc^2$";
const DISPLAY_SOURCE = "$$\nx^2\n\ny^2\n$$";
const DESCENDER_SOURCE = "$x_1$";
const DISPLAYSTYLE_FRACTION_SOURCE = "$\\displaystyle \\frac{a}{b}$";
// 24 terms is far wider than any phone viewport regardless of the prose font size, so the
// "stays within a phone viewport" step below proves the ScrollView wrap actually engaged.
const WIDE_DISPLAY_TERMS = Array.from({ length: 24 }, (_, index) => `a_{${index + 1}}`).join(" + ");
const WIDE_DISPLAY_SOURCE = `$$\n${WIDE_DISPLAY_TERMS}\n$$`;
const RESPONSE = [
  `Energy is ${INLINE_SOURCE} here.`,
  "",
  DISPLAY_SOURCE,
  "",
  `The subscript ${DESCENDER_SOURCE} sits on the sentence baseline.`,
  "",
  `A compact fraction ${DISPLAYSTYLE_FRACTION_SOURCE} stays inline with the sentence.`,
  "",
  WIDE_DISPLAY_SOURCE,
  "",
  "Done.",
].join("\n");

// MathJax's deterministic SVG output for these expressions under the same TeX package set
// and fontCache config math-formula.tsx uses (base, ams, newcommand, noundefined; fontCache
// "none"). These ex values come straight from typesetting the expressions offline and don't
// move unless MathJax or that package set changes. math-formula.tsx turns every one of them
// into a pixel width/height/offset by multiplying by the *same* fontSize scalar, so a ratio
// between two of these measurements is fontSize-independent — useful because the rendered
// fontSize here (an inherited React Native Web style, not a plain CSS cascade) isn't something
// this spec can read reliably off computed styles.
const X1_WIDTH_EX = 2.282;
const X1_VERTICAL_ALIGN_EX = -0.339;
// "\frac{a}{b}" inline once math-formula.tsx strips a leading \displaystyle (the fixed behavior).
const FRACTION_WIDTH_EX_COMPACT = 1.842;
const FRACTION_HEIGHT_EX_COMPACT = 2.395;
// "\displaystyle \frac{a}{b}" inline if the strip never ran — the regression this step proves absent.
const FRACTION_WIDTH_EX_BLOWN_UP = 2.192;
const FRACTION_HEIGHT_EX_BLOWN_UP = 4.104;
const PHONE_VIEWPORT = { width: 390, height: 844 };

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

async function svgBoundingBox(svg: Locator): Promise<{ width: number; height: number }> {
  const box = await svg.boundingBox();
  if (!box) {
    throw new Error("Expected a bounding box for the formula svg");
  }
  return box;
}

/**
 * Walks up from an inline formula's svg to the nearest ancestor carrying an explicit inline
 * "top" style — the baseline-offset `View` math-formula.tsx wraps inline formulas in. Searching
 * by the inline style itself (rather than assuming a fixed DOM depth) survives any wrapper
 * react-native-svg happens to add around the svg.
 */
async function inlineBaselineOffsetPx(svg: Locator): Promise<number> {
  return svg.evaluate((element) => {
    let node = element.parentElement;
    for (let depth = 0; node && depth < 5; depth++) {
      if (node.style.top !== "") {
        return Number.parseFloat(getComputedStyle(node).top);
      }
      node = node.parentElement;
    }
    return Number.NaN;
  });
}

test("renders LaTeX through the markdown-math plugin and copies its source", async ({
  page,
  context,
}, testInfo) => {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-markdown-math-e2e-"));
  await cp(EXAMPLE_DIRECTORY, directory, { recursive: true });
  await vendorPluginDependencies(directory);
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
      await expect(assistantMessage.locator("svg")).toHaveCount(5, { timeout: 30_000 });
      await expect(assistantMessage).toContainText("Energy is");
      await expect(assistantMessage).not.toContainText(INLINE_SOURCE);
      await expect(assistantMessage).not.toContainText(DESCENDER_SOURCE);
      await expect(assistantMessage).not.toContainText(DISPLAYSTYLE_FRACTION_SOURCE);
      await expect(assistantMessage).not.toContainText("$$");
      await page.screenshot({
        path: testInfo.outputPath("plugin-markdown-math-rendered.png"),
        fullPage: true,
      });
    });

    await test.step("an inline subscript sits on the sentence baseline, not floating above it", async () => {
      // Document order matches prose order: E=mc^2, the x^2/y^2 display block, then this subscript.
      const descenderSvg = assistantMessage.locator("svg").nth(2);
      const offsetPx = await inlineBaselineOffsetPx(descenderSvg);
      const { width: widthPx } = await svgBoundingBox(descenderSvg);
      // offsetPx and widthPx both scale with the same fontSize, so their ratio cancels it out.
      const expectedRatio = -X1_VERTICAL_ALIGN_EX / X1_WIDTH_EX;

      // CSS vertical-align is positive-up; RN's "top" is positive-down, so a descender's negative
      // vertical-align becomes a positive "top" that nudges the glyph box down onto the baseline.
      expect(offsetPx).toBeGreaterThan(0);
      expect(offsetPx / widthPx).toBeCloseTo(expectedRatio, 2);
    });

    await test.step("an inline \\displaystyle fraction renders at the compact inline size", async () => {
      const fractionSvg = assistantMessage.locator("svg").nth(3);
      const box = await svgBoundingBox(fractionSvg);
      // Height-to-width is fontSize-independent, so compare it to the two known ex-unit shapes
      // directly: the compact shape the fix produces, and the roughly 44% taller-per-width shape
      // \displaystyle produces left unstripped — the regression this step proves absent.
      const compactRatio = FRACTION_HEIGHT_EX_COMPACT / FRACTION_WIDTH_EX_COMPACT;
      const blownUpRatio = FRACTION_HEIGHT_EX_BLOWN_UP / FRACTION_WIDTH_EX_BLOWN_UP;
      const actualRatio = box.height / box.width;

      expect(actualRatio).toBeCloseTo(compactRatio, 1);
      expect(actualRatio).toBeLessThan((compactRatio + blownUpRatio) / 2);
    });

    await test.step("a wide display equation scrolls instead of overflowing a phone viewport", async () => {
      await page.setViewportSize(PHONE_VIEWPORT);
      const wideFormulaSvg = assistantMessage.locator("svg").nth(4);
      const wideFormulaWrapper = wideFormulaSvg.locator(
        "xpath=ancestor::*[@data-paseo-markdown-source][1]",
      );
      // A narrow viewport can flip the app into its compact layout, which can briefly
      // re-render this subtree. Wait for both elements to settle before reading geometry —
      // boundingBox() itself doesn't retry the way an expect(...).toBeVisible() assertion does.
      await expect(wideFormulaSvg).toBeVisible();
      await expect(wideFormulaWrapper).toBeVisible();

      const svgBox = await wideFormulaSvg.boundingBox();
      const wrapperBox = await wideFormulaWrapper.boundingBox();
      if (!svgBox || !wrapperBox) {
        throw new Error("Expected bounding boxes for the wide display formula and its wrapper");
      }

      // The formula is genuinely wider than the viewport...
      expect(svgBox.width).toBeGreaterThan(PHONE_VIEWPORT.width);
      // ...but its wrapper is capped to the viewport instead of pushing the page wider.
      expect(wrapperBox.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
      const documentScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentScrollWidth).toBeLessThanOrEqual(PHONE_VIEWPORT.width);

      await page.screenshot({
        path: testInfo.outputPath("plugin-markdown-math-wide-display-phone.png"),
        fullPage: true,
      });
    });

    await test.step("a drag selection copies the LaTeX source with its spacing", async () => {
      await allowClipboard(context);
      await selectAssistantMessage(page);
      const copied = await copySelection(page);
      expect(copied).toContain(`Energy is ${INLINE_SOURCE} here.`);
      expect(copied).toContain(DISPLAY_SOURCE);
      expect(copied).toContain(`The subscript ${DESCENDER_SOURCE} sits on the sentence baseline.`);
      expect(copied).toContain(
        `A compact fraction ${DISPLAYSTYLE_FRACTION_SOURCE} stays inline with the sentence.`,
      );
      expect(copied).toContain(WIDE_DISPLAY_SOURCE);
    });

    await test.step("removing the plugin restores the literal text", async () => {
      await client.removePlugin(PLUGIN_ID);
      await expect(assistantMessage).toContainText(INLINE_SOURCE, { timeout: 30_000 });
      await expect(assistantMessage).toContainText(DESCENDER_SOURCE);
      await expect(assistantMessage).toContainText(DISPLAYSTYLE_FRACTION_SOURCE);
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
