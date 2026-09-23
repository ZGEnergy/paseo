import { useEffect } from "react";
import { useSidebarModel } from "@/components/sidebar/sidebar-model";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";

export function WorkspaceShortcutTargetsSubscriber({ enabled }: { enabled: boolean }) {
  const { shortcutModel } = useSidebarModel();
  const setSidebarShortcutWorkspaceTargets = useKeyboardShortcutsStore(
    (state) => state.setSidebarShortcutWorkspaceTargets,
  );
  const setSidebarNavigationWorkspaceTargets = useKeyboardShortcutsStore(
    (state) => state.setSidebarNavigationWorkspaceTargets,
  );

  useEffect(() => {
    if (!enabled) {
      setSidebarShortcutWorkspaceTargets([]);
      setSidebarNavigationWorkspaceTargets([]);
      return;
    }

    setSidebarShortcutWorkspaceTargets(shortcutModel.shortcutTargets);
    setSidebarNavigationWorkspaceTargets(shortcutModel.navigationTargets);
  }, [
    enabled,
    setSidebarShortcutWorkspaceTargets,
    setSidebarNavigationWorkspaceTargets,
    shortcutModel.shortcutTargets,
    shortcutModel.navigationTargets,
  ]);

  useEffect(() => {
    return () => {
      setSidebarShortcutWorkspaceTargets([]);
      setSidebarNavigationWorkspaceTargets([]);
    };
  }, [setSidebarShortcutWorkspaceTargets, setSidebarNavigationWorkspaceTargets]);

  return null;
}
