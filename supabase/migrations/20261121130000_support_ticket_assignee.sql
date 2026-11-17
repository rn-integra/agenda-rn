-- Chamados: responsável do suporte, a primeira pessoa da equipe que atua no chamado
-- (responde ou muda o status). Aparece na fila e no chamado, no console.

alter table public.support_tickets add column if not exists assigned_staff_id bigint references public.users(id);
alter table public.support_tickets add column if not exists assigned_at timestamptz;
create index if not exists support_tickets_assignee_idx on public.support_tickets(assigned_staff_id, last_message_at desc) where assigned_staff_id is not null;

-- Chamados que já tinham resposta do suporte: o responsável é quem respondeu primeiro.
update public.support_tickets t set assigned_staff_id = m.author_user_id, assigned_at = m.created_at
from (
  select distinct on (ticket_id) ticket_id, author_user_id, created_at
  from public.support_ticket_messages where from_support order by ticket_id, created_at
) m
where m.ticket_id = t.id and t.assigned_staff_id is null;
