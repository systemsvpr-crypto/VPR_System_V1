-- Stores every outgoing WhatsApp message attempt made via the send-whatsapp edge function.
create table if not exists public.whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  recipient_phone text,
  recipient_name text,
  template_name text,
  language text,
  module text,                 -- sales | purchase | docs | checklist
  reference_type text,
  reference_id text,
  sent_by text,

  parameters jsonb,
  header_parameters jsonb,
  header_document jsonb,
  request_payload jsonb,

  status text not null default 'failed',   -- sent | failed | delivered | read
  wa_message_id text,
  http_status integer,
  error_code text,
  error_message text,
  response_payload jsonb,

  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz
);

create index if not exists whatsapp_logs_created_at_idx on public.whatsapp_logs (created_at desc);
create index if not exists whatsapp_logs_phone_idx on public.whatsapp_logs (recipient_phone);
create index if not exists whatsapp_logs_template_idx on public.whatsapp_logs (template_name);
create index if not exists whatsapp_logs_status_idx on public.whatsapp_logs (status);
create index if not exists whatsapp_logs_wa_message_id_idx on public.whatsapp_logs (wa_message_id);

-- RLS on with no policies: only the service role (edge function) can read/write.
alter table public.whatsapp_logs enable row level security;
