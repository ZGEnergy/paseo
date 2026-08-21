/**
 * Decide whether electron-builder may auto-discover a macOS signing identity.
 *
 * electron-builder defaults to scanning the login keychain and signing with the
 * first identity it finds. On a developer Mac that identity is often something
 * unrelated to app distribution (an "Apple Configurator" cert, an enterprise MDM
 * cert). Signing with it then blocks in `codesign` waiting on a SecurityAgent
 * keychain-password prompt that no one can see, because the build is running
 * non-interactively. The build does not fail — it hangs indefinitely, partway
 * through signing thousands of files inside the bundle.
 *
 * So: never touch the keychain unless signing was actually asked for.
 *
 *   - CSC_IDENTITY_AUTO_DISCOVERY set explicitly -> honour it verbatim.
 *   - CSC_LINK set -> a certificate was supplied on purpose (this is the CI
 *     signing path), leave electron-builder alone.
 *   - otherwise, on macOS -> force discovery off. electron-builder falls back to
 *     an ad-hoc signature, which is what a local build wants anyway: the bundle
 *     runs on this machine and is not distributable either way.
 *
 * Non-darwin hosts are left untouched; the hang is specific to the macOS
 * keychain, and Windows signing is driven by CSC_LINK rather than discovery.
 */
export function resolveSigningPlan({ env = {}, platform = process.platform, argv = [] } = {}) {
  if (env.CSC_IDENTITY_AUTO_DISCOVERY !== undefined) {
    return { disableAutoDiscovery: false, extraArgs: [], reason: "explicit" };
  }

  if (env.CSC_LINK) {
    return { disableAutoDiscovery: false, extraArgs: [], reason: "certificate-supplied" };
  }

  if (platform !== "darwin") {
    return { disableAutoDiscovery: false, extraArgs: [], reason: "not-macos" };
  }

  // Notarization is meaningless without a real identity. electron-builder
  // already skips it when it cannot build the options, but a developer with
  // APPLE_ID exported would otherwise send an ad-hoc bundle to Apple.
  // Only add the flag when the caller has not spoken about it, so that a
  // forwarded -c.mac.notarize wins instead of colliding into a yargs array.
  const callerSetNotarize = argv.some((arg) => arg.startsWith("-c.mac.notarize"));

  return {
    disableAutoDiscovery: true,
    extraArgs: callerSetNotarize ? [] : ["-c.mac.notarize=false"],
    reason: "no-identity-configured",
  };
}
