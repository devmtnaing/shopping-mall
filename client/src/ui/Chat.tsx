// Chat: a quiet log bottom-left (lines fade after a while) and a box that opens with Enter.
// Messages render as text through Preact, never as HTML.
import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { commands } from '../commands';
import { t } from '../i18n';
import { chat, chatOpen, muted, netStatus, toast, toggleMute } from '../state';

/** Lines older than this fade out of the resting log (they're still there when chat is open). */
const FRESH_MS = 12_000;

export function Chat() {
  const input = useRef<HTMLInputElement>(null);
  const text = useSignal('');
  const now = useSignal(Date.now());
  const open = chatOpen.value;
  const online = netStatus.value === 'online';
  const menu = useSignal<number | null>(null); // chat line key whose name menu is open

  // re-check freshness every couple of seconds so old lines fade on their own
  useEffect(() => {
    const id = setInterval(() => (now.value = Date.now()), 2000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    // a click anywhere outside the chat closes it (unless you've typed something)
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.chat') && !text.value) chatOpen.value = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const visible = chat.value.filter((l) => l.from === undefined || !muted.value.has(l.from));
  const lines = open ? visible.slice(-30) : visible.slice(-6).filter((l) => now.value - l.at < FRESH_MS);
  const close = () => {
    chatOpen.value = false;
    text.value = '';
  };

  return (
    <section class={open ? 'chat open' : 'chat'} aria-label={t('chat.open')}>
      {lines.length > 0 && (
        <ol class="chat-log" aria-live="polite">
          {lines.map((l) => (
            <li key={l.key} class={l.kind}>
              {l.kind === 'msg' &&
                (open && l.from !== undefined ? (
                  <button
                    type="button"
                    class={l.host ? 'who host' : 'who'}
                    aria-label={t('mod.options', { name: l.name ?? '' })}
                    aria-expanded={menu.value === l.key}
                    onClick={() => (menu.value = menu.value === l.key ? null : l.key)}
                  >
                    {l.name}
                  </button>
                ) : (
                  <b class={l.host ? 'host' : ''}>{l.name}</b>
                ))}
              {l.text}
              {menu.value === l.key && l.from !== undefined && (
                <span class="who-menu">
                  <button
                    type="button"
                    onClick={() => {
                      toggleMute(l.from as number);
                      menu.value = null;
                    }}
                  >
                    {muted.value.has(l.from) ? t('mod.unmute') : t('mod.mute')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      commands.report(l.from as number);
                      toast(t('mod.reported'));
                      menu.value = null;
                    }}
                  >
                    {t('mod.report')}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {open ? (
        <form
          class="chat-form glass"
          onSubmit={(e) => {
            e.preventDefault();
            const msg = text.value.trim();
            if (msg && online) commands.sendChat(msg);
            close();
          }}
        >
          <input
            ref={input}
            value={text.value}
            maxLength={200}
            enterKeyHint="send"
            placeholder={online ? t('chat.placeholder') : t('chat.offline')}
            disabled={!online}
            aria-label={t('chat.placeholder')}
            onInput={(e) => (text.value = (e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
          />
          <button type="submit" disabled={!online}>
            {t('chat.send')}
          </button>
        </form>
      ) : (
        online && <p class="chat-hint">{t('chat.hint')}</p>
      )}
    </section>
  );
}
