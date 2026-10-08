// The types of shop a rental applicant can choose (no zod here, so the client can import it cheaply).
/**
 * What kind of shop the applicant has in mind. Each is one of the mall's interior layouts
 * (client/src/world/layouts.ts), so they can see how their unit would be furnished.
 */
export const SHOP_KINDS = ['cafe', 'books', 'fashion', 'home', 'games', 'software', 'store'] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];
/** The shop category that gets each kind's interior (the category picks the furniture). */
export const CATEGORY_FOR_KIND: Record<ShopKind, string> = {
  cafe: 'Food & drink',
  books: 'Books',
  fashion: 'Fashion',
  home: 'Home',
  games: 'Games',
  software: 'Software',
  store: 'Shop',
};
/** The category that leaves a unit empty and shows it as for rent. */
export const FOR_RENT_CATEGORY = 'For rent';
/** The categories the host picks from when adding or editing a shop: one per kind, and for rent. */
export const SHOP_CATEGORIES: readonly string[] = [
  ...SHOP_KINDS.map((k) => CATEGORY_FOR_KIND[k]),
  FOR_RENT_CATEGORY,
];
