// Rental applications (migrations/004_rentals.sql). Visitors apply for a vacant unit; the host
// approves or turns it down. Only one per unit waits at a time (migrations/007), so the first to
// apply holds the unit; approving still turns down any other waiting one, for older data.
import type { RentalApplication, RentalRequest, RentalStatus, ShopKind } from '@shopping-mall/shared/rentals';
import type { Sql } from './db.ts';

type Row = {
  id: string;
  slot: string;
  name: string;
  email: string;
  phone: string | null;
  business: string;
  kind: ShopKind;
  about: string;
  status: RentalStatus;
  created_at: Date;
  decided_at: Date | null;
};

const toApplication = (r: Row): RentalApplication => ({
  id: Number(r.id),
  slot: r.slot,
  name: r.name,
  email: r.email,
  ...(r.phone ? { phone: r.phone } : {}),
  business: r.business,
  kind: r.kind,
  about: r.about,
  status: r.status,
  createdAt: r.created_at.toISOString(),
  ...(r.decided_at ? { decidedAt: r.decided_at.toISOString() } : {}),
});

/** Whether a shop is in this unit now. */
export async function slotTaken(sql: Sql, slot: string): Promise<boolean> {
  const [row] = await sql`select 1 from shops where slot = ${slot}`;
  return !!row;
}

/**
 * Save an application, or return null if someone else's is already waiting for that unit. The
 * unique index on waiting applications (migrations/007) decides races: of several sent at once,
 * exactly one is saved.
 */
export async function saveRental(sql: Sql, r: RentalRequest): Promise<RentalApplication | null> {
  const [row] = await sql<
    Row[]
  >`insert into rental_applications (slot, name, email, phone, business, kind, about)
    values (${r.slot}, ${r.name}, ${r.email}, ${r.phone || null}, ${r.business}, ${r.kind}, ${r.about})
    on conflict (slot) where status = 'pending' do nothing
    returning *`;
  return row ? toApplication(row) : null;
}

/** Units with an application waiting for the host (no one else can apply for them meanwhile). */
export async function requestedSlots(sql: Sql): Promise<string[]> {
  const rows = await sql<{ slot: string }[]>`select slot from rental_applications
    where status = 'pending' order by slot`;
  return rows.map((r) => r.slot);
}

/** Every application: waiting ones first, then the newest. */
export async function listRentals(sql: Sql): Promise<RentalApplication[]> {
  const rows = await sql<Row[]>`select * from rental_applications
    order by (status = 'pending') desc, created_at desc`;
  return rows.map(toApplication);
}

/**
 * Approve or turn down a waiting application. Approving also turns down the others waiting for
 * the same unit. Returns null if there's no such application, 'decided' if it isn't waiting.
 */
export async function decideRental(
  sql: Sql,
  id: number,
  status: 'approved' | 'rejected',
): Promise<RentalApplication | null | 'decided'> {
  return sql.begin(async (tx) => {
    const [row] = await tx<Row[]>`select * from rental_applications where id = ${id} for update`;
    if (!row) return null;
    if (row.status !== 'pending') return 'decided';
    const [done] = await tx<Row[]>`update rental_applications set status = ${status}, decided_at = now()
      where id = ${id} returning *`;
    if (status === 'approved')
      await tx`update rental_applications set status = 'rejected', decided_at = now()
        where slot = ${row.slot} and status = 'pending'`;
    return toApplication(done as Row);
  });
}

export async function deleteRental(sql: Sql, id: number): Promise<boolean> {
  const res = await sql`delete from rental_applications where id = ${id}`;
  return res.count > 0;
}
