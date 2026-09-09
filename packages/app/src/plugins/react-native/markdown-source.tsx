import { useMemo, type ReactNode } from "react";
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
  const dataSet = useMemo(() => ({ [MARKDOWN_COPY_SOURCE_DATASET_KEY]: source }), [source]);
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
