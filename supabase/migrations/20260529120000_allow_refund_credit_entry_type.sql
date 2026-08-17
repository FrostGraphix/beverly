-- Phase 0 fix: refund approvals write a ledger entry with entry_type='refund_credit',
-- but the wallet_ledger_entries CHECK constraint never allowed that value, so
-- fn_post_ledger_entry rejected every refund credit. Add 'refund_credit' to the
-- allowed set. Kept in sync with the EntryType union in services/ledger.ts.
alter table public.wallet_ledger_entries
  drop constraint if exists wallet_ledger_entries_entry_type_check,
  add constraint wallet_ledger_entries_entry_type_check check (entry_type in (
    'funding_credit',
    'payment_credit',
    'purchase_debit',
    'meter_order_debit',
    'manual_credit',
    'manual_debit',
    'reversal_credit',
    'reversal_debit',
    'fee_debit',
    'promo_credit',
    'refund_credit'
  ));
