import { useMemo, type ReactNode } from "react";
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { MARKDOWN_COPY_SOURCE_DATASET_KEY } from "@/assistant-selection-copy/markup";
import { isWeb } from "@/constants/platform";

const SELECT_AS_UNIT = { userSelect: "all" } as const;
// Absolute so it cannot take a line of its own in the display branch's column layout.
const CARET_ANCHOR = { position: "absolute" } as const;
const ZERO_WIDTH_SPACE = "​";

export interface MarkdownSourceProps {
  source: string;
  display?: boolean;
  style?: StyleProp<ViewStyle | TextStyle>;
  children: ReactNode;
}

// Wrapped content is usually drawn rather than written — a rendered formula's SVG, say — so the
// wrapper often holds no text of its own. A browser selection anchors to a text position, and
// without one inside the wrapper a press anchors at the nearest text instead: in the next block
// entirely for display content, or just past the element for inline content. Either way the
// selection excludes the wrapper and its source never reaches the clipboard. A zero-width space
// supplies the missing position, and `userSelect: "all"` widens it to the whole wrapper.
//
// Native has no caret and no DOM selection, so the anchor is web-only. There it costs nothing:
// screen readers do not announce a zero-width space, and the copy path overwrites the wrapper's
// text with `source` anyway.
//
// Inline content is a nested Text so react-native-web emits a span and the copy serializer
// keeps the surrounding spaces; a View would be a div, which Turndown treats as a block and
// strips the whitespace around. Display content wants exactly that block behavior.
export function MarkdownSource({ source, display = false, style, children }: MarkdownSourceProps) {
  const dataSet = useMemo(() => ({ [MARKDOWN_COPY_SOURCE_DATASET_KEY]: source }), [source]);
  if (display) {
    return (
      <View
        style={[SELECT_AS_UNIT as ViewStyle, style as StyleProp<ViewStyle>]}
        dataSet={dataSet}
        accessibilityLabel={source}
      >
        {isWeb ? <Text style={CARET_ANCHOR}>{ZERO_WIDTH_SPACE}</Text> : null}
        {children}
      </View>
    );
  }
  return (
    <Text
      style={[SELECT_AS_UNIT as TextStyle, style as StyleProp<TextStyle>]}
      dataSet={dataSet}
      accessibilityLabel={source}
    >
      {isWeb ? ZERO_WIDTH_SPACE : null}
      {children}
    </Text>
  );
}
