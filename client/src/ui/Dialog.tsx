// Modal dialog on the native <dialog> element: focus trapping, Esc to close and an inert
// background come from the browser, not from us.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { dialog } from '../state';
import { IconClose } from './icons';

type Props = { title: string; eyebrow?: string; children: ComponentChildren };

export function Dialog({ title, eyebrow, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opener = document.activeElement as HTMLElement | null;
    el.showModal();
    return () => {
      el.close();
      opener?.focus(); // give focus back to whatever opened the dialog
    };
  }, []);
  const close = () => {
    dialog.value = null;
  };
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; Esc (native to <dialog>) is the keyboard way
    <dialog
      ref={ref}
      class="dialog"
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === ref.current && close()}
    >
      <header class="dialog-head">
        <div>
          {eyebrow && <div class="eyebrow">{eyebrow}</div>}
          <h2 id="dialog-title">{title}</h2>
        </div>
        <button type="button" class="icon-btn" aria-label="Close" onClick={close}>
          <IconClose />
        </button>
      </header>
      <div class="dialog-body">{children}</div>
    </dialog>
  );
}
