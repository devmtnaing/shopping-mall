// Pick a character and a colour: on the welcome screen, and mid-visit from the dock's Character dialog.
import { AVATARS, type AvatarId } from '@shopping-mall/shared/avatars';
import { t } from '../i18n';
import { BODY_COLORS } from '../state';

type Props = {
  avatar: string;
  color: string;
  onAvatar: (a: AvatarId) => void;
  onColor: (c: string) => void;
};

export function LookPicker({ avatar, color, onAvatar, onColor }: Props) {
  return (
    <>
      <fieldset class="avatars">
        <legend class="field-label">{t('landing.avatar')}</legend>
        {AVATARS.map((a, i) => (
          <label key={a} class="avatar-pick">
            <input
              type="radio"
              name="avatar"
              value={a}
              checked={avatar === a}
              onChange={() => onAvatar(a)}
              aria-label={t('landing.avatarOption', { n: String(i + 1) })}
            />
            <img src={`${import.meta.env.BASE_URL}assets/avatars/${a}.png`} alt="" width={40} height={40} />
          </label>
        ))}
      </fieldset>

      <fieldset class="swatches">
        <legend class="field-label">{t('landing.colour')}</legend>
        {BODY_COLORS.map((c) => (
          <label key={c} class="swatch-pick" style={{ '--c': c }}>
            <input
              type="radio"
              name="color"
              value={c}
              checked={color === c}
              onChange={() => onColor(c)}
              aria-label={t('landing.colourOption', { c })}
            />
            <span />
          </label>
        ))}
      </fieldset>
    </>
  );
}
