// "Pick an apple [F]" at a fruit stand, "Throw an apple (2) [F]" while you hold some.
import { commands } from '../commands';
import { t } from '../i18n';
import { applePrompt, nearbyShop, seatPrompt } from '../state';

const finePointer = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

export function ApplePrompt() {
  const p = applePrompt.value;
  if (!p || seatPrompt.value || nearbyShop.value) return null; // one prompt at a time
  return (
    <div class="prompt glass" key={p.mode}>
      <button type="button" class="prompt-btn" onClick={() => commands.apple()}>
        <span aria-hidden="true">🍎</span>{' '}
        {p.mode === 'pick' ? t('prompt.pickApple') : t('prompt.throwApple', { n: String(p.held) })}
        {finePointer && <kbd>F</kbd>}
      </button>
    </div>
  );
}
