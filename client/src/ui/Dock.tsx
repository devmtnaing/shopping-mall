// Bottom-centre dock.
import { dialog, overview } from '../state';
import { IconHelp, IconLayers, IconStore } from './icons';

export function Dock() {
  return (
    <nav class="dock glass" aria-label="Mall controls">
      <button type="button" class="dock-btn" onClick={() => (dialog.value = 'directory')}>
        <IconStore />
        <span>Shops</span>
      </button>
      <button
        type="button"
        class="dock-btn"
        aria-pressed={overview.value}
        onClick={() => (overview.value = !overview.value)}
      >
        <IconLayers />
        <span>Overview</span>
      </button>
      <button type="button" class="dock-btn" onClick={() => (dialog.value = 'help')}>
        <IconHelp />
        <span>Help</span>
      </button>
    </nav>
  );
}
