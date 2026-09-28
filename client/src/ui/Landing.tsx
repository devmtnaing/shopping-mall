// Welcome screen, shown over a slowly orbiting view of the mall while the world loads behind it.
import config from 'virtual:plaza-config';
import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { BODY_COLORS, mallMeta, phase, profile, saveProfile } from '../state';

export function Landing() {
  const name = useSignal(profile.value.name);
  const color = useSignal(profile.value.color);
  const error = useSignal('');
  const waiting = useSignal(false);
  const ready = mallMeta.value !== null;
  const returning = profile.value.name !== '';
  const [first, ...rest] = config.mall.name.split(' ');
  const nameRef = useRef<HTMLInputElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  // focus the next step, but not on touch screens (it would pop the keyboard over the view)
  useEffect(() => {
    if (!matchMedia('(pointer: fine)').matches) return;
    (returning ? enterRef : nameRef).current?.focus();
  }, []);

  const enter = (e: Event) => {
    e.preventDefault();
    const n = name.value.trim().normalize('NFC');
    if (n.length < 2) {
      error.value = 'Please write your name (2 letters or more).';
      nameRef.current?.focus();
      return;
    }
    saveProfile({ name: n.slice(0, 20), color: color.value });
    if (ready) phase.value = 'playing';
    else waiting.value = true; // main.ts flips the phase once the world is ready
  };
  if (waiting.value && ready) queueMicrotask(() => (phase.value = 'playing'));

  return (
    <form class="landing glass" onSubmit={enter} aria-labelledby="landing-title">
      <div class="eyebrow">Welcome to</div>
      <h1 id="landing-title">
        {first}
        {rest.length > 0 && <span> {rest.join(' ')}</span>}
      </h1>
      {config.mall.tagline && <p class="landing-tagline">{config.mall.tagline}</p>}

      <label class="field-label" for="landing-name">
        Your name
      </label>
      <input
        id="landing-name"
        class="search"
        autoComplete="nickname"
        maxLength={20}
        placeholder="Write your name"
        value={name.value}
        ref={nameRef}
        aria-invalid={!!error.value}
        aria-describedby={error.value ? 'landing-error' : undefined}
        onInput={(e) => {
          name.value = (e.target as HTMLInputElement).value;
          error.value = '';
        }}
      />
      {error.value && (
        <p id="landing-error" class="field-error" role="alert">
          {error.value}
        </p>
      )}

      <fieldset class="swatches">
        <legend class="field-label">Your colour</legend>
        {BODY_COLORS.map((c) => (
          <label key={c} class="swatch-pick" style={{ '--c': c }}>
            <input
              type="radio"
              name="color"
              value={c}
              checked={color.value === c}
              onChange={() => (color.value = c)}
              aria-label={`Colour ${c}`}
            />
            <span />
          </label>
        ))}
      </fieldset>

      <button ref={enterRef} type="submit" class="enter" disabled={waiting.value}>
        {waiting.value
          ? 'Opening the doors…'
          : returning
            ? `Enter as ${profile.value.name} →`
            : 'Enter the mall →'}
      </button>
    </form>
  );
}
