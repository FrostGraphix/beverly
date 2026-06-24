-- Standardize Beverly funding references across Paystack and bank-transfer flows.

update public.funding_requests
set funding_reference =
    'BEV-FND-' ||
    case
      when channel = 'paystack' then 'PS'
      when channel = 'bank_transfer' then 'BT'
      else 'MN'
    end ||
    '-' || to_char(coalesce(created_at, now()), 'YYYYMMDD') ||
    '-' || upper(substr(replace(vendor_organization_id::text, '-', ''), 1, 6)) ||
    '-' || upper(substr(replace(id::text, '-', ''), 1, 8))
where funding_reference is null
   or funding_reference = ''
   or funding_reference !~ '^BEV-FND-(PS|BT|MN)-[0-9]{8}-[A-F0-9]{6}-[A-F0-9]{8}$';

create unique index if not exists funding_requests_funding_reference_unique_idx
  on public.funding_requests(funding_reference)
  where funding_reference is not null;
