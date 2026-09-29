// "Sit down [E]" / "Stand up [E]" when you're at a bench (and not at a shop's door).
import { commands } from '../commands';
import { t } from '../i18n';
import { nearbyShop, seatPrompt } from '../state';

const finePointer = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

export function SeatPrompt() {
  const mode = seatPrompt.value;
  if (!mode || (mode === 'sit' && nearbyShop.value)) return null;
  return (
    <div class="prompt glass" key={mode}>
      <button type="button" class="prompt-btn" onClick={() => commands.toggleSeat()}>
        {t(mode === 'sit' ? 'prompt.sit' : 'prompt.stand')}
        {finePointer && <kbd>E</kbd>}
      </button>
    </div>
  );
}
