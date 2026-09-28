import { faded } from '../state';

/** Black overlay for teleports. CSS does the transition; reduced motion makes it instant. */
export function Fade() {
  return <div class={faded.value ? 'fade on' : 'fade'} aria-hidden="true" />;
}
