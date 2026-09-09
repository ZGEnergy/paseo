import { useMemo, type ReactNode } from "react";
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { MARKDOWN_COPY_SOURCE_DATASET_KEY } from "@/assistant-selection-copy/markup";

const SELECT_AS_UNIT = { userSelect: "all" } as const;

export interface MarkdownSourceProps {
  source: string;
  display?: boolean;
  style?: StyleProp<ViewStyle | TextStyle>;
  children: ReactNode;
}

// `userSelect: "all"` makes the wrapped content select as one unit. Without it a drag that
// starts on non-text content — a rendered formula's SVG, say — cannot place a caret inside it,
// so the browser collapses the anchor to just after the element and the selection excludes it
// entirely: the source never reaches the clipboard.
//
// Inline content is a nested Text so react-native-web emits a span and the copy serializer
// keeps the surrounding spaces; a View would be a div, which Turndown treats as a block and
// strips the whitespace around. Display content wants exactly that block behavior.
export function MarkdownSource({ source, display = false, style, children }: MarkdownSourceProps) {
  const dataSet = useMemo(() => ({ [MARKDOWN_COPY_SOURCE_DATASET_KEY]: source }), [source]);
  if (display) {
    return (
      <View
        style={[SELECT_AS_UNIT, style as StyleProp<ViewStyle>]}
        dataSet={dataSet}
        accessibilityLabel={source}
      >
        {children}
      </View>
    );
  }
  return (
    <Text
      style={[SELECT_AS_UNIT, style as StyleProp<TextStyle>]}
      dataSet={dataSet}
      accessibilityLabel={source}
    >
      {children}
    </Text>
  );
}
