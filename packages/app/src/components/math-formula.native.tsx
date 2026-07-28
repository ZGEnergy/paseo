import { Text, View } from "react-native";
import { MarkdownTextSpan } from "./markdown-text";

export interface MathFormulaProps {
  expression: string;
  source: string;
  displayMode: boolean;
}

export function MathFormula({ source, displayMode }: MathFormulaProps) {
  if (displayMode) {
    return (
      <View>
        <Text selectable>{source}</Text>
      </View>
    );
  }

  return <MarkdownTextSpan>{source}</MarkdownTextSpan>;
}
