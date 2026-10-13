-- Admin-managed KYC requirements. The application keeps a safe default if this row is absent.
insert into public.system_settings (key, value)
values ('kyc_policy', '{"customer_enabled":true,"vendor_enabled":true,"allowed_mime_types":["image/jpeg","image/png","image/webp","application/pdf"],"customer":{"tier1":{"identity":["national_id","voters_card","passport","drivers_license"],"selfie":true,"address":[]},"tier2":{"identity":["national_id","voters_card","passport","drivers_license"],"selfie":true,"address":["utility_bill","bank_statement"]}},"vendor":{"tier2":{"identity":["national_id","voters_card","passport","drivers_license"],"selfie":true,"address":["utility_bill","bank_statement"]}}}'::jsonb)
on conflict (key) do nothing;
