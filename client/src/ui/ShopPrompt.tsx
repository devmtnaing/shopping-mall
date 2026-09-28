// "Lumen Coffee · Visit [E]" pill that appears when you walk up to a shop.
import config from 'virtual:plaza-config';
import { nearbyShop, openShop } from '../state';

const finePointer = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

export function ShopPrompt() {
  const id = nearbyShop.value;
  const shop = id ? config.shops.find((s) => s.id === id) : undefined;
  // stays mounted while the panel is open (it's under the modal backdrop), so focus can return to it
  if (!shop) return null;
  return (
    <div class="prompt glass" key={shop.id}>
      <span class="prompt-name">{shop.name}</span>
      <button type="button" class="prompt-btn" onClick={() => openShop(shop.id)}>
        Visit{finePointer && <kbd>E</kbd>}
      </button>
    </div>
  );
}
