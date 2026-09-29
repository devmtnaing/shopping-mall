import { t } from '../i18n';
import { type QualitySetting, qualitySetting, setQuality, tier } from '../quality';
import { dialog } from '../state';
import { Dialog } from './Dialog';

const desktop = (): [string, string][] => [
  ['W A S D / ↑ ↓ ← →', t('help.walk')],
  ['Shift', t('help.run')],
  ['Space', t('help.jump')],
  [t('help.drag'), t('help.look')],
  [t('help.scroll'), t('help.zoom')],
  [t('help.clickFloor'), t('help.walkThere')],
  [t('help.clickShop'), t('help.walkToDoor')],
  ['Enter', t('chat.open')],
  ['1 – 6', t('emote.label')],
  ['/', t('help.findShop')],
  ['M', t('help.overview')],
  ['E', t('help.visit')],
  ['?', t('help.thisHelp')],
];
const phone = (): [string, string][] => [
  [t('help.leftThumb'), t('help.joystick')],
  [t('help.dragRight'), t('help.look')],
  [t('help.pinch'), t('help.zoom')],
  [t('help.tapFloor'), t('help.walkThere')],
  [t('help.tapShop'), t('help.walkToDoor')],
];

export function Help() {
  return (
    <Dialog title={t('help.title')} eyebrow={t('help.eyebrow')} onClose={() => (dialog.value = null)}>
      <div class="help-grid">
        <section>
          <h3>{t('help.computer')}</h3>
          <dl>
            {desktop().map(([k, v]) => (
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
          <h3>{t('help.phone')}</h3>
          <dl>
            {phone().map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <fieldset class="quality">
        <legend>{t('quality.title')}</legend>
        <div class="segmented" role="radiogroup">
          {(['auto', 'low', 'medium', 'high'] as QualitySetting[]).map((q) => (
            <label key={q} class={qualitySetting.value === q ? 'on' : undefined}>
              <input
                type="radio"
                name="quality"
                value={q}
                checked={qualitySetting.value === q}
                onChange={() => setQuality(q)}
              />
              {t(`quality.${q}`)}
              {q === 'auto' && qualitySetting.value === 'auto' && ` · ${t(`quality.${tier.value}`)}`}
            </label>
          ))}
        </div>
        <p class="hint">{t('quality.hint')}</p>
      </fieldset>
    </Dialog>
  );
}
