-- Wallet Support System
-- FAQ knowledge base + Ticketing + Quick Chat for customers and vendors.
-- All access flows through the backend service role; RLS enabled with no public policies.

-- ════════════════════════════════════════════════════════════════════════════
-- Shared enums
-- ════════════════════════════════════════════════════════════════════════════
create type support_actor_type_enum   as enum ('customer', 'vendor', 'staff', 'system');
create type support_audience_enum     as enum ('all', 'customer', 'vendor');
create type support_ticket_status_enum   as enum ('open', 'pending', 'awaiting_customer', 'resolved', 'closed');
create type support_ticket_priority_enum as enum ('low', 'normal', 'high', 'urgent');
create type support_chat_status_enum   as enum ('active', 'waiting', 'ended');

-- ════════════════════════════════════════════════════════════════════════════
-- FAQ knowledge base
-- ════════════════════════════════════════════════════════════════════════════
create table support_faq_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  description  text,
  icon         text,
  audience     support_audience_enum not null default 'all',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table support_faqs (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid references support_faq_categories(id) on delete set null,
  question          text not null,
  answer            text not null,
  audience          support_audience_enum not null default 'all',
  tags              text[] not null default '{}',
  sort_order        integer not null default 0,
  published         boolean not null default true,
  view_count        integer not null default 0,
  helpful_count     integer not null default 0,
  not_helpful_count integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index support_faqs_category_idx  on support_faqs (category_id, sort_order);
create index support_faqs_audience_idx  on support_faqs (audience) where published;
create index support_faqs_search_idx    on support_faqs using gin (to_tsvector('english', question || ' ' || answer));

-- ════════════════════════════════════════════════════════════════════════════
-- Ticketing
-- ════════════════════════════════════════════════════════════════════════════
create sequence support_ticket_seq start 1000;

create table support_tickets (
  id                       uuid primary key default gen_random_uuid(),
  reference                text unique not null
                             default ('TKT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('support_ticket_seq')::text, 5, '0')),
  requester_actor_type     support_actor_type_enum not null,
  requester_actor_id       uuid not null,
  requester_name           text,
  customer_id              uuid references customers(id) on delete set null,
  vendor_organization_id   uuid references vendor_organizations(id) on delete set null,
  category                 text not null default 'general',
  subject                  text not null,
  priority                 support_ticket_priority_enum not null default 'normal',
  status                   support_ticket_status_enum not null default 'open',
  assigned_to_user_id      uuid,
  last_message_at          timestamptz not null default now(),
  last_message_actor_type  support_actor_type_enum,
  resolved_at              timestamptz,
  closed_at                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index support_tickets_customer_idx on support_tickets (customer_id, created_at desc) where customer_id is not null;
create index support_tickets_vendor_idx   on support_tickets (vendor_organization_id, created_at desc) where vendor_organization_id is not null;
create index support_tickets_status_idx    on support_tickets (status, last_message_at desc);
create index support_tickets_assignee_idx  on support_tickets (assigned_to_user_id) where assigned_to_user_id is not null;

create table support_ticket_messages (
  id                uuid primary key default gen_random_uuid(),
  ticket_id         uuid not null references support_tickets(id) on delete cascade,
  sender_actor_type support_actor_type_enum not null,
  sender_actor_id   uuid,
  sender_name       text,
  body              text not null,
  is_internal       boolean not null default false,
  created_at        timestamptz not null default now()
);

create index support_ticket_messages_ticket_idx on support_ticket_messages (ticket_id, created_at asc);

-- ════════════════════════════════════════════════════════════════════════════
-- Quick Chat (polling-based live support)
-- ════════════════════════════════════════════════════════════════════════════
create table support_chat_sessions (
  id                      uuid primary key default gen_random_uuid(),
  requester_actor_type    support_actor_type_enum not null,
  requester_actor_id      uuid,
  display_name            text,
  customer_id             uuid references customers(id) on delete set null,
  vendor_organization_id  uuid references vendor_organizations(id) on delete set null,
  subject                 text,
  status                  support_chat_status_enum not null default 'active',
  assigned_to_user_id     uuid,
  ticket_id               uuid references support_tickets(id) on delete set null,
  unread_for_staff        integer not null default 0,
  unread_for_user         integer not null default 0,
  last_message_at         timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index support_chat_sessions_status_idx on support_chat_sessions (status, last_message_at desc);
create index support_chat_sessions_actor_idx  on support_chat_sessions (requester_actor_id, status);

create table support_chat_messages (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references support_chat_sessions(id) on delete cascade,
  sender_actor_type support_actor_type_enum not null,
  sender_actor_id   uuid,
  sender_name       text,
  body              text not null,
  kind              text not null default 'text',   -- 'text' | 'system' | 'bot' | 'quick_reply'
  created_at        timestamptz not null default now()
);

create index support_chat_messages_session_idx on support_chat_messages (session_id, created_at asc);

-- ════════════════════════════════════════════════════════════════════════════
-- updated_at triggers
-- ════════════════════════════════════════════════════════════════════════════
create or replace function set_support_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger support_faq_categories_updated_at before update on support_faq_categories
  for each row execute function set_support_updated_at();
create trigger support_faqs_updated_at before update on support_faqs
  for each row execute function set_support_updated_at();
create trigger support_tickets_updated_at before update on support_tickets
  for each row execute function set_support_updated_at();
create trigger support_chat_sessions_updated_at before update on support_chat_sessions
  for each row execute function set_support_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — service-role only (backend mediates all access)
-- ════════════════════════════════════════════════════════════════════════════
alter table support_faq_categories  enable row level security;
alter table support_faqs            enable row level security;
alter table support_tickets         enable row level security;
alter table support_ticket_messages enable row level security;
alter table support_chat_sessions   enable row level security;
alter table support_chat_messages   enable row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- Seed FAQ content
-- ════════════════════════════════════════════════════════════════════════════
insert into support_faq_categories (slug, title, description, icon, audience, sort_order) values
  ('getting-started', 'Getting started', 'Set up your account and buy your first token', 'bolt',   'all',      1),
  ('payments',        'Payments & wallet', 'Funding, refunds, and payment methods',       'wallet', 'all',      2),
  ('tokens-meters',   'Tokens & meters',  'Buying tokens and managing your meters',       'meter',  'customer', 3),
  ('vending',         'Vending',          'Selling electricity and managing float',       'store',  'vendor',   4),
  ('security',        'Security & account','Protect your account and data',               'shield', 'all',      5);

insert into support_faqs (category_id, question, answer, audience, tags, sort_order) values
  ((select id from support_faq_categories where slug='getting-started'),
   'How do I create a Beverly account?',
   'Tap “Create free account”, enter your phone or email, verify the one-time code, and you’re in. It takes under a minute and there are no setup fees.',
   'customer', array['signup','account'], 1),
  ((select id from support_faq_categories where slug='getting-started'),
   'How fast will I get my electricity token?',
   'Tokens are delivered the moment your payment is confirmed — usually in under 15 seconds. You’ll see it on screen and it’s saved to your receipts automatically.',
   'all', array['token','speed'], 2),
  ((select id from support_faq_categories where slug='payments'),
   'How do I fund my wallet?',
   'Open Wallet → Fund, choose an amount, and pay securely with your card via Paystack. Your balance updates instantly once payment succeeds.',
   'all', array['funding','wallet','paystack'], 1),
  ((select id from support_faq_categories where slug='payments'),
   'Can I get a refund for a failed purchase?',
   'Yes. If a purchase fails but you were charged, the amount is reversed to your wallet automatically. If it does not appear, raise a support ticket and our team will resolve it.',
   'all', array['refund','failed'], 2),
  ((select id from support_faq_categories where slug='tokens-meters'),
   'How do I add my prepaid meter?',
   'Go to Meters → Add meter and enter your meter number. Beverly remembers it so future top-ups are one tap.',
   'customer', array['meter','add'], 1),
  ((select id from support_faq_categories where slug='tokens-meters'),
   'What do I do if my token does not work on the meter?',
   'First re-check the 20-digit token from your receipt. If it is rejected, raise a ticket with your meter number and order reference — we will re-issue or escalate to the disco.',
   'customer', array['token','meter','error'], 2),
  ((select id from support_faq_categories where slug='vending'),
   'How do I fund my vendor float?',
   'In the vendor portal open Wallet → Fund. Submit your funding request and, once approved by Beverly, your float balance updates and you can begin vending.',
   'vendor', array['float','funding'], 1),
  ((select id from support_faq_categories where slug='vending'),
   'How do I send a token to a customer remotely?',
   'Use Remote Send, enter the meter and amount, and the token is delivered to the customer by SMS — or printed at your counter.',
   'vendor', array['remote','vend','sms'], 2),
  ((select id from support_faq_categories where slug='security'),
   'How do I keep my account secure?',
   'Enable multi-factor authentication in Security settings, never share your password or tokens, and always sign out on shared devices.',
   'all', array['mfa','security'], 1),
  ((select id from support_faq_categories where slug='security'),
   'How is my money and data protected?',
   'Payments are processed by PCI-compliant providers, your data is encrypted at rest and in transit, and every account supports multi-factor authentication.',
   'all', array['security','privacy'], 2);
