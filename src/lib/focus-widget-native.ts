import { Capacitor, registerPlugin } from "@capacitor/core";
import type { FocusWidgetSnapshot } from "./focus-widget";

type ADHDiceFocusWidgetPlugin = {
  publishSnapshot(options: { snapshot: FocusWidgetSnapshot }): Promise<{ published?: boolean }>;
  clearSnapshot(): Promise<{ cleared?: boolean }>;
};

const ADHDiceFocusWidget = registerPlugin<ADHDiceFocusWidgetPlugin>("ADHDiceFocusWidget");

export function isNativeIosFocusWidgetAvailable() {
  return Capacitor.getPlatform() === "ios"
    && Capacitor.isPluginAvailable("ADHDiceFocusWidget");
}

export async function syncFocusWidgetSnapshot(snapshot: FocusWidgetSnapshot | null) {
  if (!isNativeIosFocusWidgetAvailable()) {
    return false;
  }

  try {
    if (snapshot) {
      await ADHDiceFocusWidget.publishSnapshot({ snapshot });
    } else {
      await ADHDiceFocusWidget.clearSnapshot();
    }
    return true;
  } catch {
    return false;
  }
}
