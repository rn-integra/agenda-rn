// Nomes das ações do suporte, usados no console e no registro que a gerência da clínica vê.
export const SUPPORT_ACTION_LABEL: Record<string, string> = {
  password_set: "criou a senha de acesso ao console",
  mfa_enabled: "ativou a verificação em duas etapas",
  mfa_verified: "entrou no console",
  monitor_run: "rodou o monitor",
  incident_resolve: "marcou um incidente como resolvido",
  incident_snooze: "silenciou o aviso de um incidente",
  incident_unsnooze: "reativou o aviso de um incidente",
  organization_view: "abriu a ficha da organização",
  user_unlock: "desbloqueou o login de uma pessoa",
  user_end_sessions: "encerrou as sessões de uma pessoa",
  user_reset_link: "enviou um link de nova senha",
  ticket_reply: "respondeu um chamado",
  ticket_status: "mudou o status de um chamado",
  assist_start: "entrou com acesso assistido (somente leitura)",
  assist_end: "saiu do acesso assistido",
  audit_export: "exportou o registro de atividades",
};

export function supportActionLabel(action: string) {
  return SUPPORT_ACTION_LABEL[action] || action;
}
