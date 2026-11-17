import "server-only";
import type { Session } from "@/app/authz";
import { HttpError } from "@/lib/security/http";
import { dbError, getSupabaseAdmin } from "@/lib/supabase-admin";
import type { TicketCategory, TicketStatus } from "./ticket-rules";

export type Ticket = {
  id: number; organization_id: string; created_by: number; subject: string; category: TicketCategory;
  status: TicketStatus; context: Record<string, string | null>; last_message_from: "customer" | "support";
  last_message_at: string; resolved_at: string | null; created_at: string;
  assigned_staff_id: number | null; assigned_at: string | null;
};
export type TicketMessage = { id: number; author_user_id: number; from_support: boolean; body: string; created_at: string; author: string };
export type TicketRow = Ticket & { author: string; organization: string; assignee: string | null };

const TICKET_COLUMNS = "id,organization_id,created_by,subject,category,status,context,last_message_from,last_message_at,resolved_at,created_at,assigned_staff_id,assigned_at";

async function userNames(ids: number[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<number, string>();
  const users = await getSupabaseAdmin().from("users").select("id,name").in("id", unique);
  dbError(users.error, "Read ticket authors");
  return new Map<number, string>((users.data || []).map((u: { id: number; name: string | null }) => [Number(u.id), String(u.name || "")]));
}

async function organizationNames(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, string>();
  const orgs = await getSupabaseAdmin().from("organizations").select("id,name").in("id", unique);
  dbError(orgs.error, "Read ticket organizations");
  return new Map<string, string>((orgs.data || []).map((o: { id: string; name: string | null }) => [String(o.id), String(o.name || "")]));
}

async function withNames(tickets: Ticket[]): Promise<TicketRow[]> {
  const [authors, orgs] = await Promise.all([
    userNames(tickets.flatMap(t => [Number(t.created_by), ...(t.assigned_staff_id ? [Number(t.assigned_staff_id)] : [])])),
    organizationNames(tickets.map(t => t.organization_id))]);
  return tickets.map(t => ({ ...t, author: authors.get(Number(t.created_by)) || "—", organization: orgs.get(t.organization_id) || "—",
    assignee: t.assigned_staff_id ? authors.get(Number(t.assigned_staff_id)) || "—" : null }));
}

// Quem está na clínica: a gerência vê todos os chamados da organização ativa; os demais, só os que abriram.
export function canSeeTicket(session: Session, ticket: Pick<Ticket, "organization_id" | "created_by">) {
  if (ticket.organization_id !== session.organization.id) return false;
  return session.account.role === "general_manager" || Number(ticket.created_by) === session.account.id;
}

export async function listTicketsForSession(session: Session) {
  let query = getSupabaseAdmin().from("support_tickets").select(TICKET_COLUMNS)
    .eq("organization_id", session.organization.id).order("last_message_at", { ascending: false }).limit(100);
  if (session.account.role !== "general_manager") query = query.eq("created_by", session.account.id);
  const result = await query;
  dbError(result.error, "List tickets");
  return withNames((result.data || []) as Ticket[]);
}

// Fila do console: filtros por situação.
export const QUEUE_FILTERS = {
  ativos: ["open", "in_progress"], aguardando: ["waiting_customer"], resolvidos: ["resolved"], todos: null,
} as const satisfies Record<string, readonly TicketStatus[] | null>;
export type QueueFilter = keyof typeof QUEUE_FILTERS;

export async function listTicketQueue(filter: QueueFilter) {
  let query = getSupabaseAdmin().from("support_tickets").select(TICKET_COLUMNS)
    .order("last_message_at", { ascending: false }).limit(200);
  const statuses = QUEUE_FILTERS[filter];
  if (statuses) query = query.in("status", [...statuses]);
  const result = await query;
  dbError(result.error, "List ticket queue");
  return withNames((result.data || []) as Ticket[]);
}

export async function ticketCounts() {
  const db = getSupabaseAdmin();
  const count = async (statuses: TicketStatus[]) => {
    const result = await db.from("support_tickets").select("id", { count: "exact", head: true }).in("status", statuses);
    dbError(result.error, "Count tickets");
    return result.count ?? 0;
  };
  const [active, waiting] = await Promise.all([count(["open", "in_progress"]), count(["waiting_customer"])]);
  return { active, waiting };
}

export async function loadTicket(id: number) {
  const db = getSupabaseAdmin();
  const ticket = await db.from("support_tickets").select(TICKET_COLUMNS).eq("id", id).maybeSingle();
  dbError(ticket.error, "Read ticket");
  if (!ticket.data) return null;
  const messages = await db.from("support_ticket_messages").select("id,author_user_id,from_support,body,created_at")
    .eq("ticket_id", id).order("created_at", { ascending: true }).limit(500);
  dbError(messages.error, "Read ticket messages");
  const rows = (messages.data || []) as Omit<TicketMessage, "author">[];
  const names = await userNames(rows.map(m => Number(m.author_user_id)));
  const [row] = await withNames([ticket.data as Ticket]);
  return { ticket: row, messages: rows.map(m => ({ ...m, author: names.get(Number(m.author_user_id)) || "—" })) };
}

// Grava uma mensagem e atualiza o chamado (quem falou por último, status). O update é condicionado
// ao status lido antes, para duas respostas simultâneas não se sobreporem em silêncio.
export async function addTicketMessage(ticket: Pick<Ticket, "id" | "status"> & { assigned_staff_id?: number | null }, input: { authorId: number; fromSupport: boolean; body: string | null; status: TicketStatus }) {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const values: Record<string, string | number | null> = { status: input.status, updated_at: now };
  if (input.status === "resolved" && ticket.status !== "resolved") values.resolved_at = now;
  if (input.status !== "resolved") values.resolved_at = null;
  // A primeira pessoa do suporte que atua no chamado fica como responsável.
  if (input.fromSupport && !ticket.assigned_staff_id) { values.assigned_staff_id = input.authorId; values.assigned_at = now; }
  if (input.body) { values.last_message_at = now; values.last_message_from = input.fromSupport ? "support" : "customer"; }
  const updated = await db.from("support_tickets").update(values).eq("id", ticket.id).eq("status", ticket.status).select("id");
  dbError(updated.error, "Update ticket");
  if (!updated.data?.length) throw new HttpError(409, "O chamado mudou enquanto você escrevia. Recarregue a página.");
  if (input.body) {
    const inserted = await db.from("support_ticket_messages").insert({
      ticket_id: ticket.id, author_user_id: input.authorId, from_support: input.fromSupport, body: input.body });
    dbError(inserted.error, "Write ticket message");
  }
}
