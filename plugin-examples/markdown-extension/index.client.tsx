import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MarkdownSource, SvgXml } from "@getpaseo/plugin/client/react-native";
import { StyleSheet, View } from "react-native";

const INLINE_MARKER = "::";
const BLOCK_FENCE = ":::";
const BADGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" rx="2" fill="currentColor"/></svg>';

const styles = StyleSheet.create({
  badge: { width: 10, height: 10 },
  block: { marginVertical: 8 },
});

export default function contribute(client: PluginClientContext) {
  return client.addMarkdownExtension({
    id: "badge",
    parser: (markdown) => {
      // `::text::` becomes one leaf token whose text is never parsed again, so a backslash
      // inside it reaches the render rule intact.
      markdown.inline.ruler.before("escape", "badge_inline", (state, silent) => {
        if (!state.src.startsWith(INLINE_MARKER, state.pos)) return false;
        const contentStart = state.pos + INLINE_MARKER.length;
        const contentEnd = state.src.indexOf(INLINE_MARKER, contentStart);
        if (contentEnd <= contentStart) return false;
        if (!silent) {
          state.push("badge_inline", "span", 0).content = state.src.slice(contentStart, contentEnd);
        }
        state.pos = contentEnd + INLINE_MARKER.length;
        return true;
      });
      // `:::` … `:::`, or everything that is left while the closing fence has not streamed in.
      markdown.block.ruler.before("fence", "badge_block", (state, startLine, endLine, silent) => {
        if (state.getLines(startLine, startLine + 1, 0, false).trim() !== BLOCK_FENCE) return false;
        if (silent) return true;
        let closeLine = startLine + 1;
        while (
          closeLine < endLine &&
          state.getLines(closeLine, closeLine + 1, 0, false).trim() !== BLOCK_FENCE
        ) {
          closeLine++;
        }
        const token = state.push("badge_block", "div", 0);
        token.block = true;
        token.content = state.getLines(startLine + 1, closeLine, 0, false);
        token.markup = closeLine < endLine ? BLOCK_FENCE : "";
        state.line = Math.min(closeLine + 1, endLine);
        token.map = [startLine, state.line];
        return true;
      });
    },
    rules: {
      badge_inline: (node) => (
        <MarkdownSource key={node.key} source={`${INLINE_MARKER}${node.content}${INLINE_MARKER}`}>
          {/* SvgXml draws paths with no text content, so a screen reader has nothing to read.
              Give non-text content an accessible name; MarkdownSource carries the markdown. */}
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={node.content}
            style={styles.badge}
          >
            <SvgXml xml={BADGE_SVG} width={10} height={10} />
          </View>
        </MarkdownSource>
      ),
      // `markup` is the closing fence, or "" while the block is still streaming.
      badge_block: (node) => (
        <MarkdownSource
          key={node.key}
          display
          style={styles.block}
          source={
            node.markup
              ? `${BLOCK_FENCE}\n${node.content}\n${node.markup}`
              : `${BLOCK_FENCE}\n${node.content}`
          }
        >
          {/* Drawn, not written — the same case a formula renderer is in. A display block that
              rendered its content as text would not need MarkdownSource at all, because the text
              would already reach the clipboard on its own. */}
          <View accessible accessibilityRole="image" accessibilityLabel={node.content}>
            <SvgXml xml={BADGE_SVG} width={32} height={32} />
          </View>
        </MarkdownSource>
      ),
    },
    blockDelimiters: [{ open: BLOCK_FENCE, close: BLOCK_FENCE }],
  });
}
