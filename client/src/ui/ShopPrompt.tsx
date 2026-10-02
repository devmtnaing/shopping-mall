// "Lumen Coffee · Visit [E]" pill that appears when you walk up to a shop, and
// "Vacant unit · Rent this unit [E]" at an empty one ("Already requested" once someone has applied).

import { useEffect } from 'preact/hooks';
import { content } from '../content';
import { t } from '../i18n';
import { refreshRequested } from '../net/rentals';
import { appliedUnits, nearbyShop, nearbyUnit, openShop, rentUnit, requestedUnits } from '../state';

const finePointer = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

/** Your own application comes first; then whether someone else's is waiting. */
const unitLabel = (unit: string | null) =>
  unit && appliedUnits.value.includes(unit)
    ? 'prompt.applied'
    : unit && requestedUnits.value.includes(unit)
      ? 'prompt.requested'
      : 'prompt.rent';

export function ShopPrompt() {
  const id = nearbyShop.value;
  const shop = id ? content.value.shops.find((s) => s.id === id) : undefined;
  const unit = nearbyUnit.value;
  // walking up to a vacant unit: check whether someone has applied for it since
  useEffect(() => {
    if (unit) void refreshRequested();
  }, [unit]);
  // stays mounted while the panel is open (it's under the modal backdrop), so focus can return to it
  if (!shop && !unit) return null;
  return (
    <div class="prompt glass" key={shop?.id ?? unit}>
      <span class="prompt-name">{shop ? shop.name : t('zone.vacant')}</span>
      <button
        type="button"
        class="prompt-btn"
        onClick={() => {
          if (shop) openShop(shop.id);
          else rentUnit.value = unit;
        }}
      >
        {t(shop ? 'prompt.visit' : unitLabel(unit))}
        {finePointer && <kbd>E</kbd>}
      </button>
    </div>
  );
}
