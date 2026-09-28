// Bottom-centre dock.
import { t } from '../i18n';
import { dialog, overview } from '../state';
import { IconHelp, IconLayers, IconStore } from './icons';

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
      <button type="button" class="dock-btn" onClick={() => (dialog.value = 'help')}>
        <IconHelp />
        <span>{t('dock.help')}</span>
      </button>
    </nav>
  );
}
