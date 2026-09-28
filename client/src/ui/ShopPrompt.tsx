// "Lumen Coffee · Visit [E]" pill that appears when you walk up to a shop.
import config from 'virtual:plaza-config';
import { nearbyShop, openShop, panel } from '../state';

const finePointer = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

export function ShopPrompt() {
  const id = nearbyShop.value;
  const shop = id ? config.shops.find((s) => s.id === id) : undefined;
  if (!shop || panel.value === shop.id) return null;
  return (
    <div class="prompt glass" key={shop.id}>
      <span class="prompt-name">{shop.name}</span>
      <button type="button" class="prompt-btn" onClick={() => openShop(shop.id)}>
        Visit{finePointer && <kbd>E</kbd>}
      </button>
    </div>
  );
}
