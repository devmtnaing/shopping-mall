// Change character and colour mid-visit (dock → Character). Changes apply at once, here and for
// everyone in the room, and are remembered like the welcome screen's.
import { t } from '../i18n';
import { dialog, profile, saveProfile } from '../state';
import { Dialog } from './Dialog';
import { LookPicker } from './LookPicker';

export function Character() {
  const p = profile.value;
  return (
    <Dialog title={t('character.title')} eyebrow={p.name} onClose={() => (dialog.value = null)}>
      <div class="character-dialog">
        <LookPicker
          avatar={p.avatar}
          color={p.color}
          onAvatar={(avatar) => saveProfile({ ...profile.value, avatar })}
          onColor={(color) => saveProfile({ ...profile.value, color })}
        />
      </div>
    </Dialog>
  );
}
