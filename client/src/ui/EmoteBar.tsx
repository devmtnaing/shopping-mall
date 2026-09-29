// Emoji reactions. Desktop: keys 1–8 (shown on the buttons). Phones: opened from the dock.
import { EMOTES } from '@shopping-mall/shared/protocol';
import { commands } from '../commands';
import { t } from '../i18n';
import { emoteBar } from '../state';

const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

export function EmoteBar() {
  if (!emoteBar.value && !fine) return null;
  return (
    <div class="emotes glass" role="toolbar" aria-label={t('emote.label')}>
      {EMOTES.map((e, i) => (
        <button
          key={e}
          type="button"
          aria-label={`${t('emote.label')} ${e}`}
          onClick={() => {
            commands.emote(e);
            emoteBar.value = false;
          }}
        >
          <span aria-hidden="true">{e}</span>
          {fine && <kbd>{i + 1}</kbd>}
        </button>
      ))}
    </div>
  );
}
