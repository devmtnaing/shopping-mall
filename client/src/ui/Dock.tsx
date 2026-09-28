// Bottom-centre dock. Later tasks add their buttons here (Shops T-307, Overview T-309).
import { dialog } from '../state';
import { IconHelp } from './icons';

export function Dock() {
  return (
    <nav class="dock glass" aria-label="Mall controls">
      <button type="button" class="dock-btn" onClick={() => (dialog.value = 'help')}>
        <IconHelp />
        <span>Help</span>
      </button>
    </nav>
  );
}
