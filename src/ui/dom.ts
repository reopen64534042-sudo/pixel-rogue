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
