import { dialog } from '../state';
import { Dialog } from './Dialog';

const DESKTOP: [string, string][] = [
  ['W A S D / arrows', 'Walk'],
  ['Shift', 'Run'],
  ['Space', 'Jump'],
  ['Drag', 'Look around'],
  ['Scroll', 'Zoom'],
  ['Click the floor', 'Walk there'],
  ['Click a shop', 'Walk to its door'],
  ['/', 'Find a shop'],
  ['M', 'Overview of the whole floor'],
  ['E', 'Visit the shop in front of you'],
  ['?', 'This help'],
];
const PHONE: [string, string][] = [
  ['Left thumb', 'Joystick: walk'],
  ['Drag on the right', 'Look around'],
  ['Pinch', 'Zoom'],
  ['Tap the floor', 'Walk there'],
  ['Tap a shop', 'Walk to its door'],
];

export function Help() {
  return (
    <Dialog title="Getting around" eyebrow="How to play" onClose={() => (dialog.value = null)}>
      <div class="help-grid">
        <section>
          <h3>Computer</h3>
          <dl>
            {DESKTOP.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3>Phone</h3>
          <dl>
            {PHONE.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </Dialog>
  );
}
