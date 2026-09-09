import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { connectNewWorkspaceDaemonClient } from "../support/helpers/new-workspace";
import { copyPluginExample } from "../support/helpers/plugin-fixture";

const PLUGIN_ID = "markdown-extension";
const MARKDOWN_SOURCE_SELECTOR = "[data-paseo-markdown-source]";

// A backslash and an underscore: Turndown escapes both when it serializes ordinary prose, so
// copying this back verbatim only works through the declared MarkdownSource path.
const INLINE_SOURCE = "::a\\_b::";
const INLINE_LINE = `Inline ${INLINE_SOURCE} renders as a badge.`;
// A `:::` block with no closing fence is what a still-streaming block looks like. Without the
// extension's declared delimiter the splitter cuts it at the blank line and the block rule only
// ever sees "still".
const BLOCK_SOURCE = ":::\nstill\n\nstreaming";
const RESPONSE = `${INLINE_LINE}\n\n${BLOCK_SOURCE}`;

// Runs in the browser, so it can't close over MARKDOWN_SOURCE_SELECTOR.
function readDeclaredSources(elements: HTMLElement[]): (string | null)[] {
  return elements.map((element) => element.getAttribute("data-paseo-markdown-source"));
}

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

test("renders and copies assistant markdown through an installed extension", async ({
  page,
  context,
}) => {
  const example = await copyPluginExample(PLUGIN_ID);
  const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
  const previousConfig = await client.getDaemonConfig();
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "plugin-markdown-extension-",
    title: "Markdown extension",
    initialPrompt: "Render the configured markdown response.",
    featureValues: { mockAssistantResponse: RESPONSE },
  });

  try {
    await client.patchDaemonConfig({ pluginsEnabled: true });
    await client.installDirectoryPlugin(example.directory);
    await agent.client.waitForFinish(agent.agentId, 30_000);
    await openAgentRoute(page, agent);

    const assistantMessage = page.getByTestId("assistant-message").last();
    await expect(assistantMessage).toBeVisible({ timeout: 30_000 });

    await test.step("the extension's parser and rules render through the assistant message", async () => {
      // One svg: the inline badge the extension draws with the SDK's SvgXml.
      await expect(assistantMessage.locator("svg")).toHaveCount(1, { timeout: 30_000 });
      await expect(assistantMessage).toContainText("renders as a badge.");
      await expect(assistantMessage).toContainText("streaming");
      await expect(assistantMessage).not.toContainText(INLINE_SOURCE);
      await expect(assistantMessage).not.toContainText(":::");
    });

    await test.step("a declared block delimiter keeps an unclosed block in one render block", async () => {
      const declared = await assistantMessage
        .locator(MARKDOWN_SOURCE_SELECTOR)
        .evaluateAll(readDeclaredSources);
      expect(declared).toEqual([INLINE_SOURCE, BLOCK_SOURCE]);
    });

    await test.step("a drag selection copies the declared source verbatim", async () => {
      await allowClipboard(context);
      await selectAssistantMessage(page);
      const copied = await copySelection(page);
      expect(copied).toBe(`${INLINE_LINE}\n\n${BLOCK_SOURCE}`);
    });

    await test.step("removing the plugin restores the built-in rendering", async () => {
      await client.removePlugin(PLUGIN_ID);
      // markdown-it's own escape rule eats the backslash once the extension no longer claims
      // the run — the built-in rendering, restored.
      await expect(assistantMessage).toContainText("::a_b::", { timeout: 30_000 });
      await expect(assistantMessage).toContainText(":::");
    });

    await test.step("the removed extension leaves nothing behind", async () => {
      await expect(assistantMessage.locator("svg")).toHaveCount(0);
      await expect(assistantMessage.locator(MARKDOWN_SOURCE_SELECTOR)).toHaveCount(0);
    });
  } finally {
    await client.removePlugin(PLUGIN_ID).catch(() => undefined);
    await client
      .patchDaemonConfig({ pluginsEnabled: previousConfig.config.pluginsEnabled ?? false })
      .catch(() => undefined);
    await client.close().catch(() => undefined);
    await agent.cleanup().catch(() => undefined);
    await example.cleanup();
  }
});
