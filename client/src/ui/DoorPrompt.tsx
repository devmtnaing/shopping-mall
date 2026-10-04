// "Close the door [E]" / "Open the door [E]" at a restroom cubicle, or "Engaged" when someone else
// closed it (nothing to press).
import { commands } from '../commands';
import { t } from '../i18n';
import { doorPrompt } from '../state';

const finePointer = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

export function DoorPrompt() {
  const mode = doorPrompt.value;
  if (!mode) return null;
  if (mode === 'engaged')
    return (
      <div class="prompt glass" key={mode} role="status">
        <span class="prompt-btn">{t('prompt.doorEngaged')}</span>
      </div>
    );
  return (
    <div class="prompt glass" key={mode}>
      <button type="button" class="prompt-btn" onClick={() => commands.toggleDoor()}>
        {t(mode === 'close' ? 'prompt.doorClose' : 'prompt.doorOpen')}
        {finePointer && <kbd>E</kbd>}
      </button>
    </div>
  );
}
