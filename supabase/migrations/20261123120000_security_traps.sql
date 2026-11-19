-- Armadilhas para robôs e IAs exploradoras: novos tipos de evento de segurança.
--   trap_triggered  — acesso a um caminho-isca (/.env, /wp-admin, /painel-interno…)
--   canary_key_used — uso da chave falsa publicada como isca (ver lib/security/trap-paths.ts)
-- Os eventos não têm organização: guardam só o resumo do IP (ip_hash), o caminho e o método.
alter table public.security_events drop constraint if exists security_events_kind_check;
alter table public.security_events add constraint security_events_kind_check check (kind = any (array[
  'login_success','login_failure','login_unverified','password_reset','invite_accepted','organization_switch',
  'patient_export','patient_anonymized','trap_triggered','canary_key_used'
]::text[]));

-- A lista do console (eventos de armadilha das últimas 24 h) filtra por tipo e data.
create index if not exists security_events_trap_idx on public.security_events (created_at desc)
  where kind in ('trap_triggered','canary_key_used');
