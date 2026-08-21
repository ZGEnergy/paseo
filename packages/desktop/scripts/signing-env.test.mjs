import { describe, expect, it } from "vitest";

import { resolveSigningPlan } from "./signing-env.mjs";

describe("resolveSigningPlan", () => {
  it("disables keychain discovery for a local macOS build with no certificate", () => {
    const plan = resolveSigningPlan({ env: {}, platform: "darwin" });

    expect(plan.disableAutoDiscovery).toBe(true);
    expect(plan.reason).toBe("no-identity-configured");
    expect(plan.extraArgs).toContain("-c.mac.notarize=false");
  });

  it("leaves the CI signing path untouched when a certificate is supplied", () => {
    const plan = resolveSigningPlan({
      env: { CSC_LINK: "base64-cert", CSC_KEY_PASSWORD: "hunter2" },
      platform: "darwin",
    });

    expect(plan.disableAutoDiscovery).toBe(false);
    expect(plan.reason).toBe("certificate-supplied");
    expect(plan.extraArgs).toEqual([]);
  });

  it("honours an explicit CSC_IDENTITY_AUTO_DISCOVERY in either direction", () => {
    for (const value of ["false", "true"]) {
      const plan = resolveSigningPlan({
        env: { CSC_IDENTITY_AUTO_DISCOVERY: value },
        platform: "darwin",
      });

      expect(plan.disableAutoDiscovery).toBe(false);
      expect(plan.reason).toBe("explicit");
    }
  });

  it("lets a developer opt back into keychain signing", () => {
    const plan = resolveSigningPlan({
      env: { CSC_IDENTITY_AUTO_DISCOVERY: "true" },
      platform: "darwin",
    });

    expect(plan.disableAutoDiscovery).toBe(false);
  });

  it("does not interfere on non-macOS hosts", () => {
    for (const platform of ["linux", "win32"]) {
      const plan = resolveSigningPlan({ env: {}, platform });

      expect(plan.disableAutoDiscovery).toBe(false);
      expect(plan.reason).toBe("not-macos");
      expect(plan.extraArgs).toEqual([]);
    }
  });

  it("does not duplicate a notarize flag the caller already passed", () => {
    const plan = resolveSigningPlan({
      env: {},
      platform: "darwin",
      argv: ["--publish", "never", "-c.mac.notarize=false"],
    });

    expect(plan.disableAutoDiscovery).toBe(true);
    expect(plan.extraArgs).not.toContain("-c.mac.notarize=false");
  });

  it("disables hardened runtime so the ad-hoc bundle can launch", () => {
    const plan = resolveSigningPlan({ env: {}, platform: "darwin" });

    expect(plan.extraArgs).toContain("-c.mac.hardenedRuntime=false");
  });

  it("does not duplicate a hardenedRuntime flag the caller already passed", () => {
    const plan = resolveSigningPlan({
      env: {},
      platform: "darwin",
      argv: ["-c.mac.hardenedRuntime=true"],
    });

    expect(plan.disableAutoDiscovery).toBe(true);
    expect(plan.extraArgs).not.toContain("-c.mac.hardenedRuntime=false");
  });

  it("leaves hardened runtime alone when a real certificate is supplied", () => {
    const plan = resolveSigningPlan({ env: { CSC_LINK: "base64-cert" }, platform: "darwin" });

    expect(plan.extraArgs).toEqual([]);
  });
});
