-- Registro do suporte inalterável também dentro do banco.
-- Desde a fase 1 o servidor (service_role) só pode ler e acrescentar em public.support_audit.
-- Esta trava vale para qualquer papel, inclusive o dono das tabelas: UPDATE, DELETE e TRUNCATE
-- são recusados. Para mexer, alguém teria de remover a trava por migração, o que fica no histórico
-- do repositório e do Supabase.

create or replace function public.support_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'O registro do suporte não pode ser alterado nem apagado.' using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function public.support_audit_append_only() from public, anon, authenticated;

drop trigger if exists support_audit_no_update on public.support_audit;
create trigger support_audit_no_update before update or delete on public.support_audit
  for each row execute function public.support_audit_append_only();

drop trigger if exists support_audit_no_truncate on public.support_audit;
create trigger support_audit_no_truncate before truncate on public.support_audit
  for each statement execute function public.support_audit_append_only();
