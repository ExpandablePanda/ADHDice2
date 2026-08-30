type DropdownRect = Pick<DOMRectReadOnly, "bottom" | "top">;

type DropdownOptionElement = Pick<HTMLElement, "getBoundingClientRect">;

type DropdownScrollPanel = Pick<HTMLElement, "getBoundingClientRect" | "scrollTop">;

export function revealDropdownOptionWithinPanel(
  option: DropdownOptionElement | null,
  panel: DropdownScrollPanel | null,
) {
  if (!option || !panel) {
    return;
  }

  const panelRect: DropdownRect = panel.getBoundingClientRect();
  const optionRect: DropdownRect = option.getBoundingClientRect();
  if (optionRect.top < panelRect.top) {
    panel.scrollTop = Math.max(0, panel.scrollTop + optionRect.top - panelRect.top);
  } else if (optionRect.bottom > panelRect.bottom) {
    panel.scrollTop += optionRect.bottom - panelRect.bottom;
  }
}

export function focusDropdownControl(element: HTMLElement | null) {
  element?.focus({ preventScroll: true });
}

export function shouldCloseDropdownOnFocusLeave(root: HTMLElement | null, relatedTarget: EventTarget | null) {
  return !root?.contains(relatedTarget as Node | null);
}

export function shouldCloseDropdownOnTab(key: string, isOpen: boolean) {
  return isOpen && key === "Tab";
}
