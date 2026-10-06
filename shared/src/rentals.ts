// Rental applications: a visitor walks up to a vacant unit, presses E and asks to rent it. The
// host sees every application in /admin. The first to apply holds the unit until the host decides.
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

/**
 * What became of an email the mall sent, as its provider reported it: `sent` until it says more.
 * `bounced` and `suppressed` mean it never arrived (`suppressed`: an earlier bounce, so the provider
 * didn't try); `delayed` is a temporary hold-up; `complained`: they marked it as spam.
 */
export type MailStatus = {
  status: 'sent' | 'delivered' | 'delayed' | 'bounced' | 'suppressed' | 'complained' | 'failed';
  /** The provider's words, for a bounce or a failure. */
  detail?: string;
  /** ISO time of the latest news. */
  at: string;
};

/** An application as the host sees it. */
export type RentalApplication = Omit<RentalRequest, 'website'> & {
  id: number;
  status: RentalStatus;
  /** ISO times. */
  createdAt: string;
  decidedAt?: string;
  /** Why it was turned down: the host's words, or that the email to them bounced. */
  reason?: string;
  /** The approval email, once one was sent. */
  mail?: MailStatus;
};

/** A shop taken out of the mall, and why (by the host, or because emails to its owner bounced). */
export type RemovedShop = {
  id: number;
  shop: string;
  slot: string;
  name: string;
  ownerEmail?: string;
  reason: string;
  /** ISO time. */
  removedAt: string;
};
