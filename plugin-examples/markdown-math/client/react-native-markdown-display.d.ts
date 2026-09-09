// The runtime sets `sourceInfo` on fence nodes but the shipped .d.ts omits it.
export type { ASTNode } from "react-native-markdown-display";

declare module "react-native-markdown-display" {
  interface ASTNode {
    sourceInfo?: string;
  }
}
