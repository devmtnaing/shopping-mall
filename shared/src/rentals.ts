// Rental applications: a visitor walks up to a vacant unit, presses E and asks to rent it. The
// host sees every application in /admin and approves one per unit (the others are turned down).
import { z } from 'zod';
import { SHOP_KINDS } from './shop-kinds.ts';

export { CATEGORY_FOR_KIND, SHOP_KINDS, type ShopKind } from './shop-kinds.ts';

const text = (max: number) => z.string().trim().max(max, `At most ${max} characters.`);
const required = (max: number) => text(max).min(1, 'Please fill this in.');

/** What a visitor sends. `website` is a honeypot: people never see it, so only bots fill it in. */
export const rentalRequestSchema = z.object({
  slot: z.string().regex(/^[a-z0-9-]{1,32}$/, 'Unknown unit.'),
  name: required(80),
  email: z.email('That email address doesn’t look right.').max(120),
  phone: text(40).optional(),
  business: required(80),
  kind: z.enum(SHOP_KINDS, 'Choose a type of shop.'),
  about: required(1000),
  website: z.string().max(200).optional(),
});
export type RentalRequest = z.infer<typeof rentalRequestSchema>;

export const RENTAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

/** An application as the host sees it. */
export type RentalApplication = Omit<RentalRequest, 'website'> & {
  id: number;
  status: RentalStatus;
  /** ISO times. */
  createdAt: string;
  decidedAt?: string;
};
