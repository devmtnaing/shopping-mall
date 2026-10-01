// Rental applications (migrations/004_rentals.sql). Visitors apply for a vacant unit; the host
// approves one per unit, which turns down everyone else still waiting for that unit.
import type { RentalApplication, RentalRequest, RentalStatus } from '@shopping-mall/shared/rentals';
import type { Sql } from './db.ts';

type Row = {
  id: string;
  slot: string;
  name: string;
  email: string;
  phone: string | null;
  business: string;
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

export async function saveRental(sql: Sql, r: RentalRequest): Promise<RentalApplication> {
  const [row] = await sql<Row[]>`insert into rental_applications (slot, name, email, phone, business, about)
    values (${r.slot}, ${r.name}, ${r.email}, ${r.phone || null}, ${r.business}, ${r.about})
    returning *`;
  return toApplication(row as Row);
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
