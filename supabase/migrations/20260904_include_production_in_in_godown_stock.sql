-- PRODUCTION_IN counts as stock coming IN (same as IN_FACTORY, PURCHASE_IN,
-- etc.) for the live current-stock view. Run AFTER
-- 20260904_add_production_in_txn_type.sql has been applied/committed.
drop view if exists public.godown_stock;

create view public.godown_stock
with
  (security_invoker = on) as
select
  product_id,
  godown_id,
  sum(
    case
      when txn_type = any (
        array[
          'OPEN_STOCK'::txn_type,
          'IN_FACTORY'::txn_type,
          'PRODUCTION_IN'::txn_type,
          'TRANSFER_IN'::txn_type,
          'ADJUSTMENT_IN'::txn_type,
          'PURCHASE_IN'::txn_type
        ]
      ) then qty
      else - qty
    end
  ) as current_stock
from
  transactions
where
  is_void = false
group by
  product_id,
  godown_id;
