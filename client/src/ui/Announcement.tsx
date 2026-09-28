// Host announcements: a banner under the zone label for a few seconds (also logged in chat).
import { useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { announcement } from '../state';

const SHOW_MS = 8000;

export function Announcement() {
  const a = announcement.value;
  useEffect(() => {
    if (!a) return;
    const id = setTimeout(() => {
      if (announcement.value?.key === a.key) announcement.value = null;
    }, SHOW_MS);
    return () => clearTimeout(id);
  }, [a?.key]);
  if (!a) return null;
  return (
    <div class="announce glass" role="status" key={a.key}>
      <span class="eyebrow">📣 {t('host.announcement')}</span>
      <span>{a.text}</span>
    </div>
  );
}
