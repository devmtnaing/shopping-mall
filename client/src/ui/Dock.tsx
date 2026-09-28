// Bottom-centre dock.
import { t } from '../i18n';
import { chatOpen, dialog, emoteBar, netStatus, overview } from '../state';
import { IconChat, IconHelp, IconLayers, IconStore } from './icons';

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function Dock() {
  return (
    <nav class="dock glass" aria-label={t('dock.label')}>
      <button type="button" class="dock-btn" onClick={() => (dialog.value = 'directory')}>
        <IconStore />
        <span>{t('dock.shops')}</span>
      </button>
      <button
        type="button"
        class="dock-btn"
        aria-pressed={overview.value}
        onClick={() => (overview.value = !overview.value)}
      >
        <IconLayers />
        <span>{t('dock.overview')}</span>
      </button>
      {netStatus.value === 'online' && (
        <button type="button" class="dock-btn" onClick={() => (chatOpen.value = !chatOpen.value)}>
          <IconChat />
          <span>{t('chat.open')}</span>
        </button>
      )}
      {/* phones open the emoji bar from here; desktop has keys 1–6 and the side bar */}
      {coarse && (
        <button
          type="button"
          class="dock-btn dock-emote"
          aria-pressed={emoteBar.value}
          onClick={() => (emoteBar.value = !emoteBar.value)}
        >
          <span aria-hidden="true">😊</span>
          <span>{t('emote.label')}</span>
        </button>
      )}
      <button type="button" class="dock-btn" onClick={() => (dialog.value = 'help')}>
        <IconHelp />
        <span>{t('dock.help')}</span>
      </button>
    </nav>
  );
}
