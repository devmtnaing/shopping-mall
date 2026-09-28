// "Are you the host?" on the landing screen. Only shown when the server has HOST_SECRET set.
// The token lives in memory (state.hostToken), never in storage.
import { useSignal } from '@preact/signals';
import { t } from '../i18n';
import { signInAsHost } from '../net/socket';
import { hostToken } from '../state';

export function HostSignIn() {
  const open = useSignal(false);
  const secret = useSignal('');
  const error = useSignal('');
  const busy = useSignal(false);

  if (hostToken.value) return <p class="host-ok">★ {t('host.signedIn')}</p>;
  if (!open.value)
    return (
      <button type="button" class="link-btn" onClick={() => (open.value = true)}>
        {t('host.signIn')}
      </button>
    );

  const submit = async () => {
    if (!secret.value || busy.value) return;
    busy.value = true;
    const r = await signInAsHost(secret.value);
    busy.value = false;
    if (r.token) {
      hostToken.value = r.token;
      secret.value = '';
    } else error.value = r.error ?? '';
  };

  // plain elements, not a nested <form>: the landing card is already one
  return (
    <div class="host-signin">
      <input
        type="password"
        class="search"
        autoComplete="current-password"
        aria-label={t('host.password')}
        placeholder={t('host.password')}
        value={secret.value}
        onInput={(e) => {
          secret.value = (e.target as HTMLInputElement).value;
          error.value = '';
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault(); // don't submit the landing form
          submit();
        }}
      />
      <div class="host-actions">
        <button type="button" class="link-btn" onClick={() => (open.value = false)}>
          {t('host.cancel')}
        </button>
        <button type="button" class="pill-btn" disabled={busy.value} onClick={submit}>
          {t('host.submit')}
        </button>
      </div>
      {error.value && (
        <p class="field-error" role="alert">
          {error.value}
        </p>
      )}
    </div>
  );
}
