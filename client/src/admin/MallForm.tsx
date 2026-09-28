// The mall's own details: name, tagline, accent, currency, languages.

import { useSignal } from '@preact/signals';
import type { MallConfig } from '@shopping-mall/shared/config';
import { type ApiError, api, type FieldError } from './api';
import { Color, errorFor, Text } from './fields';

export function MallForm({ mall, onSaved }: { mall: MallConfig['mall']; onSaved: () => void }) {
  const m = useSignal({ ...mall, locales: mall.locales.join(', ') });
  const errors = useSignal<FieldError[]>([]);
  const status = useSignal('');
  const set = (patch: Partial<typeof m.value>) => (m.value = { ...m.value, ...patch });
  const err = (p: string) => errorFor(errors.value, p);
  return (
    <form
      class="editor"
      aria-labelledby="mall-title"
      onSubmit={async (e) => {
        e.preventDefault();
        errors.value = [];
        status.value = 'Saving…';
        try {
          const locales = m.value.locales
            .split(',')
            .map((l) => l.trim())
            .filter(Boolean);
          await api.saveMall({ ...m.value, locales });
          status.value = 'Saved.';
          onSaved();
        } catch (x) {
          errors.value = (x as ApiError).fields ?? [];
          status.value = (x as Error).message;
        }
      }}
    >
      <header class="editor-head">
        <h2 id="mall-title">Mall</h2>
        <button type="submit" class="btn primary">
          Save
        </button>
      </header>
      {status.value && (
        <p class={errors.value.length ? 'banner error' : 'banner'} role="status">
          {status.value}
        </p>
      )}
      <div class="grid">
        <Text
          label="Name"
          value={m.value.name}
          maxLength={40}
          error={err('name')}
          onInput={(name) => set({ name })}
        />
        <Text
          label="Tagline"
          value={m.value.tagline}
          maxLength={140}
          error={err('tagline')}
          onInput={(tagline) => set({ tagline })}
        />
        <Color
          label="Accent colour"
          value={m.value.accent}
          error={err('accent')}
          onInput={(accent) => set({ accent })}
        />
        <Text
          label="Currency (3 letters)"
          value={m.value.currency}
          maxLength={3}
          error={err('currency')}
          onInput={(currency) => set({ currency: currency.toUpperCase() })}
        />
        <Text
          label="Languages"
          value={m.value.locales}
          hint="Comma-separated codes, first is the default: en, my"
          error={err('locales')}
          onInput={(locales) => set({ locales })}
        />
      </div>
    </form>
  );
}
