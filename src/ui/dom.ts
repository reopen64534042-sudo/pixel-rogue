export function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`缺少 UI 节点 #${id}`);
  return found;
}
export function elementWithin(
  parent: HTMLElement,
  selector: string,
): HTMLElement {
  const found = parent.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`缺少 UI 节点 ${selector}`);
  return found;
}

/** Keep keyboard focus in the active settings window without blocking native controls. */
export function trapTabFocus(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== "Tab") return;
  const controls = Array.from(root.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
  )).filter(node => node.getClientRects().length > 0);
  const first = controls[0], last = controls[controls.length - 1];
  if (!root.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
