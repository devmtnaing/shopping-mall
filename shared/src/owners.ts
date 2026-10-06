// What a shop owner (a tenant signed in at /shop-admin/ with their own password) may do. Kept small:
// every photo is stored and served by the mall, and hosting has a budget.
export const OWNER_LIMITS = {
  /** Products in their list (no JSON feeds for owners). */
  products: 5,
  /** Photos (logo and product images) kept for one shop at a time. Unused ones are cleared. */
  photos: 8,
  /** Largest photo, in bytes. The admin page shrinks photos before uploading, well under this. */
  photoBytes: 300 * 1024,
  /** Shortest password. */
  passwordMin: 8,
  /** How long a set-password link works, in days. */
  inviteDays: 7,
} as const;

/** A shop's owner, as the host sees it in /admin. */
export type OwnerInfo = {
  shop: string;
  email: string;
  /** 'invited': the set-password link hasn't been used yet; 'expired': it ran out unused. */
  status: 'invited' | 'active' | 'expired';
};
