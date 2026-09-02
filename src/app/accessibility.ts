import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function trapFocusInElement(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;

  const focusableElements = Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter((element) => !element.hasAttribute("hidden"));
  if (focusableElements.length === 0) return;

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];
  if (!first || !last) return;

  const activeElement = document.activeElement;
  if (event.shiftKey && (activeElement === first || !container.contains(activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (activeElement === last || !container.contains(activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

export function trapFocusInDialog(event: ReactKeyboardEvent<HTMLElement>): void {
  trapFocusInElement(event.currentTarget, event.nativeEvent);
}
