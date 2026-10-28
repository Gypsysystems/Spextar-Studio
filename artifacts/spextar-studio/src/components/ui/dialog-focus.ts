import { useRef } from 'react';

type Handler = (event: Event) => void;

/** Controlled dialogs need a return target even when they have no Radix Trigger.
 * Consumers such as the link editor may deliberately restore a text selection;
 * their explicit close-focus policy always takes precedence. */
export function useDialogFocusReturn(onOpen?: Handler, onClose?: Handler) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus(event: Event) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      onOpen?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onClose?.(event);
      if (!event.defaultPrevented && opener.current?.isConnected &&
          opener.current !== document.body && opener.current !== document.documentElement) {
        event.preventDefault();
        opener.current.focus({ preventScroll: true });
      }
    },
  };
}
