// O esqueleto do banco (backups/schema) já traz o console do suporte pronto. Os testes que conferem
// as migrações do suporte desde o começo (inclusive a conversão de platform_staff para support_staff)
// usam este SQL para voltar o esqueleto ao estado de antes do suporte e aplicar as migrações em ordem.
export const BEFORE_SUPPORT = `
  drop table if exists public.support_ticket_messages, public.support_tickets, public.support_access_grants,
    public.support_setup_tokens, public.support_sessions, public.support_audit, public.support_staff,
    public.platform_staff cascade;
  alter table public.sessions drop column if exists support_grant_id, drop column if exists support_staff_id,
    drop column if exists mfa_verified_at;
  alter table public.monitor_incidents drop column if exists snoozed_until;
  drop function if exists public.support_staff_invite(text, text, boolean);
  drop function if exists public.support_staff_setup(text, text, text);
  drop function if exists public.assisted_session_context(text);
  drop function if exists public.support_audit_append_only();
`;
