import { useMemo, type ReactNode } from "react";
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { MARKDOWN_COPY_SOURCE_DATASET_KEY } from "@/assistant-selection-copy/markup";

const SELECT_AS_UNIT = { userSelect: "all" } as const;

export interface MarkdownSourceProps {
  source: string;
  display?: boolean;
  style?: StyleProp<ViewStyle | TextStyle>;
  children?: ReactNode;
}

// Native has no caret and no DOM selection. Inline content stays a nested Text; display
// content is a View so it lays out as a block.
export function MarkdownSource({ source, display = false, style, children }: MarkdownSourceProps) {
  const dataSet = useMemo(() => ({ [MARKDOWN_COPY_SOURCE_DATASET_KEY]: source }), [source]);
  if (display) {
    return (
      <View
        style={[SELECT_AS_UNIT as ViewStyle, style as StyleProp<ViewStyle>]}
        dataSet={dataSet}
        accessibilityLabel={source}
      >
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
      {children}
    </Text>
  );
}
