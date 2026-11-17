// Conversa de um chamado, igual no app e no console. "viewer" diz de que lado está quem lê,
// para alinhar as próprias mensagens à direita.
type Message = { id: number; from_support: boolean; body: string; created_at: string; author: string };

const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default function TicketThread({ messages, viewer }: { messages: Message[]; viewer: "customer" | "support" }) {
  return <ol className="space-y-4">
    {messages.map(message => {
      const mine = message.from_support === (viewer === "support");
      return <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.from_support ? "bg-[#eaf3f1] text-slate-800" : "border border-slate-200 bg-white text-slate-800"} ${mine ? "rounded-br-md" : "rounded-bl-md"}`}>
          <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{message.from_support ? (viewer === "support" ? message.author : "Suporte RN Integra") : message.author}</span>
            {message.from_support && viewer === "customer" && <span>{message.author}</span>}
            <time dateTime={message.created_at}>{when.format(new Date(message.created_at))}</time>
          </p>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
        </div>
      </li>;
    })}
  </ol>;
}
