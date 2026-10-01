-- The type of shop an applicant has in mind (SHOP_KINDS in shared/src/rentals.ts); it picks the
-- interior when the host creates the shop. Applications from before this column are 'store'.
alter table rental_applications add column kind text not null default 'store';
