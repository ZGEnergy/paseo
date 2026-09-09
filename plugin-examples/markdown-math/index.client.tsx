import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createMathExtension } from "./client/extension";
import { MathFormula } from "./client/math-formula";

export default function contribute(client: PluginClientContext) {
  client.addMarkdownExtension(createMathExtension(MathFormula));
  return () => {};
}
