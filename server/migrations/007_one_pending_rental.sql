-- One waiting application per unit: the first to apply holds it until the host decides, and a
-- unique index (not a check in code) makes that hold when several people send at the same moment.
-- Units that already have several waiting keep the earliest; the later ones are turned down.
update rental_applications r set status = 'rejected', decided_at = now()
  where r.status = 'pending'
    and exists (
      select 1 from rental_applications e
      where e.slot = r.slot and e.status = 'pending'
        and (e.created_at, e.id) < (r.created_at, r.id)
    );
create unique index rental_applications_one_pending on rental_applications (slot)
  where status = 'pending';
