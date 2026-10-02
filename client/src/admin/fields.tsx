// Small labelled form fields for the admin. Each shows its server-side validation error.
import type { ComponentChildren } from 'preact';
import type { FieldError } from './api';

let uid = 0;
const nextId = () => `f${++uid}`;

export const errorFor = (errors: FieldError[], path: string) => errors.find((e) => e.path === path)?.message;

type Base = { label: string; error?: string; hint?: string };

function Field({ label, error, hint, id, children }: Base & { id: string; children: ComponentChildren }) {
  return (
    <div class={error ? 'field has-error' : 'field'}>
      <label for={id}>{label}</label>
      {children}
      {hint && !error && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <small id={`${id}-err`} class="error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function Text(
  props: Base & {
    value: string;
    onInput: (v: string) => void;
    placeholder?: string;
    required?: boolean;
    maxLength?: number;
    readOnly?: boolean;
  },
) {
  const id = nextId();
  return (
    <Field {...props} id={id}>
      <input
        id={id}
        value={props.value}
        placeholder={props.placeholder}
        required={props.required}
        maxLength={props.maxLength}
        readOnly={props.readOnly}
        aria-invalid={!!props.error}
        aria-describedby={props.error ? `${id}-err` : props.hint ? `${id}-hint` : undefined}
        onInput={(e) => props.onInput((e.target as HTMLInputElement).value)}
      />
    </Field>
  );
}

export function Area(props: Base & { value: string; onInput: (v: string) => void; rows?: number }) {
  const id = nextId();
  return (
    <Field {...props} id={id}>
      <textarea
        id={id}
        rows={props.rows ?? 3}
        value={props.value}
        aria-invalid={!!props.error}
        onInput={(e) => props.onInput((e.target as HTMLTextAreaElement).value)}
      />
    </Field>
  );
}

export function Color(props: Base & { value: string; onInput: (v: string) => void }) {
  const id = nextId();
  return (
    <Field {...props} id={id}>
      <span class="color-row">
        <input
          id={id}
          type="color"
          value={props.value}
          onInput={(e) => props.onInput((e.target as HTMLInputElement).value)}
        />
        <code>{props.value}</code>
      </span>
    </Field>
  );
}

export function Select(
  props: Base & {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string; disabled?: boolean }[];
  },
) {
  const id = nextId();
  return (
    <Field {...props} id={id}>
      <select
        id={id}
        value={props.value}
        aria-invalid={!!props.error}
        onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export { slug } from '@shopping-mall/shared/slug';
