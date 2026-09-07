export type FocusTimerPickerChevronAction = "open" | "close";

export function resolveFocusTimerPickerChevronAction({
  currentIsOpen,
  pointerOpenState,
}: {
  currentIsOpen: boolean;
  pointerOpenState: boolean | null;
}): FocusTimerPickerChevronAction {
  const wasOpen = pointerOpenState ?? currentIsOpen;
  return wasOpen ? "close" : "open";
}
