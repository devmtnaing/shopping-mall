import { toasts } from '../state';

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class="toast glass">
          {t.text}
        </div>
      ))}
    </div>
  );
}
