import { Text, View } from "react-native";

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

  return <Text selectable>{source}</Text>;
}
