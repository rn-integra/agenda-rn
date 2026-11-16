import Link from "next/link";

// Página inicial pública: apresenta o produto e leva para "Criar conta" ou "Entrar".
// Só descreve o que o sistema já faz; nada de preço ou promessa que ainda não existe.

const features = [
  { title: "Várias agendas, uma visão", text: "Alterne entre os médicos ou veja o dia de todos de uma vez. Consultas, cirurgias, bloqueios e encaixes no mesmo lugar.", icon: "calendar" },
  { title: "Cirurgias em vários hospitais", text: "Procedimento, hospital, equipe e anestesista em cada atendimento, com aviso de conflito de horário entre agendas.", icon: "hospital" },
  { title: "Cada pessoa vê só o que precisa", text: "A gerência vê tudo; a secretária, as agendas liberadas para ela; o médico, a própria agenda e as compartilhadas.", icon: "users" },
  { title: "Resumo do dia", text: "Confirmações pendentes, guias a enviar, conflitos e sugestões paradas aparecem logo no topo da agenda.", icon: "spark" },
  { title: "Médico sugere, secretaria confirma", text: "O médico propõe um horário pelo celular e a secretaria aprova ou ajusta, com tudo registrado.", icon: "chat" },
  { title: "Agenda em PDF e documentos", text: "Imprima a agenda com layout pronto e guarde os documentos de cada cirurgia junto do atendimento.", icon: "doc" },
] as const;

const audiences = [
  { title: "Empresas de gestão de agendas", text: "Assessorias e secretariados médicos que cuidam da agenda de vários profissionais, em clínicas e hospitais diferentes.", tag: "Feito para isso" },
  { title: "Clínicas", text: "Equipe de recepção trabalhando nas agendas de todos os médicos da casa, com permissões por pessoa." },
  { title: "Médicos autônomos", text: "Comece com a sua agenda e traga uma secretária quando precisar." },
] as const;

const steps = [
  { title: "Crie a conta da sua organização", text: "Você fica como titular e gerente geral." },
  { title: "Cadastre os médicos e convide a equipe", text: "Cada pessoa recebe um convite por e-mail e cria a própria senha." },
  { title: "Organize as agendas", text: "Defina o que cada secretária acessa e comece a agendar." },
] as const;

const security = [
  "Os dados de cada organização ficam isolados: ninguém de fora enxerga a sua agenda.",
  "Acesso só ao que cada papel precisa, conferido a cada ação.",
  "Senhas protegidas e bloqueio automático contra tentativas de adivinhação.",
  "Servidores e banco de dados no Brasil, em São Paulo.",
  "Recursos para a LGPD: exportação e anonimização dos dados de pacientes.",
] as const;

function Icon({ name }: { name: (typeof features)[number]["icon"] }) {
  const paths: Record<string, React.ReactNode> = {
    calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M8 17h6" /></>,
    hospital: <><path d="M4 20V7l8-4 8 4v13M4 20h16" /><path d="M12 8v6M9 11h6M10 20v-3h4v3" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.3.2 3.9 1.8 4.5 4.3" /></>,
    spark: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="M12 8.5 13.2 11l2.3 1-2.3 1-1.2 2.5-1.2-2.5-2.3-1 2.3-1z" /></>,
    chat: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" /><path d="m9 10 2 2 4-4" /></>,
    doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 15h5M10 18h3" /></>,
  };
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Logo({ light = false }: { light?: boolean }) {
  return <span className="flex items-center gap-3">
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <img src="/agenda-rn-icon.jpg" alt="" className="h-full w-full object-contain" />
    </span>
    <span className={`text-lg font-semibold tracking-tight ${light ? "text-white" : "text-[#12374f]"}`}>RN Integra</span>
  </span>;
}

// Prévia ilustrativa da agenda (dados fictícios, sem nomes de pacientes).
function AgendaPreview() {
  const rows = [
    { time: "07:30", kind: "Cirurgia", detail: "Artroscopia de joelho · Hospital Central", agenda: "Ortopedia", tone: "bg-[#12857f]" },
    { time: "09:00", kind: "Consulta", detail: "Retorno pós-operatório", agenda: "Ortopedia", tone: "bg-sky-500" },
    { time: "10:15", kind: "Cirurgia", detail: "Anestesia · Hospital Santa Luzia", agenda: "Anestesiologia", tone: "bg-[#12857f]" },
    { time: "14:00", kind: "Consulta", detail: "Primeira consulta", agenda: "Cardiologia", tone: "bg-sky-500" },
  ];
  return <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-label="Exemplo ilustrativo da agenda" role="img">
    <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-[#9cddd1]/50 via-white/0 to-[#93c8d6]/50 blur-2xl" />
    <div className="rounded-[1.75rem] border border-white/80 bg-white/95 p-5 shadow-[0_30px_90px_rgba(18,55,79,.16)]">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Hoje</p><p className="text-lg font-semibold text-[#12374f]">Todas as agendas</p></div>
        <span className="rounded-full bg-[#eaf3f1] px-3 py-1 text-xs font-medium text-[#12857f]">3 médicos</span>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">Resumo do dia</p>
        <p className="mt-0.5 text-amber-800/90">2 confirmações pendentes · 1 guia a enviar</p>
      </div>
      <ul className="mt-4 space-y-2.5">
        {rows.map(row => <li key={row.time} className="flex items-stretch gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
          <span className={`w-1 shrink-0 rounded-full ${row.tone}`} />
          <span className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-slate-700">{row.time}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800">{row.kind}</span>
            <span className="block truncate text-xs text-slate-500">{row.detail}</span>
          </span>
          <span className="hidden shrink-0 self-center rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm sm:block">{row.agenda}</span>
        </li>)}
      </ul>
    </div>
  </div>;
}

export function LandingPage() {
  const nav = [["#funcionalidades", "Funcionalidades"], ["#para-quem", "Para quem"], ["#como-funciona", "Como funciona"], ["#seguranca", "Segurança"]];
  return <div className="min-h-screen bg-white text-[#1f2a37]">
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="RN Integra — página inicial"><Logo /></Link>
        <nav aria-label="Seções" className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex">
          {nav.map(([href, label]) => <a key={href} href={href} className="hover:text-[#12857f]">{label}</a>)}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/entrar" className="rounded-xl px-3 py-2 text-sm font-semibold text-[#12374f] hover:bg-slate-50">Entrar</Link>
          <Link href="/cadastro" className="rounded-xl bg-[#12857f] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0f7570]">Criar conta</Link>
        </div>
      </div>
    </header>

    <main>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#edf5ef] via-[#e3efee] to-[#dbe9f1]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div>
            <p className="inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#12857f] shadow-sm">Gestão de agendas médicas</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-[#12374f] sm:text-5xl lg:text-[3.4rem]">A agenda de todos os seus médicos, em um só lugar.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">Para quem cuida da agenda de vários profissionais: consultas, cirurgias em hospitais diferentes e anestesistas, com cada pessoa da equipe vendo só o que precisa.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/cadastro" className="inline-flex h-12 items-center justify-center rounded-xl bg-[#12857f] px-6 font-semibold text-white shadow-sm hover:bg-[#0f7570]">Criar conta</Link>
              <Link href="/entrar" className="inline-flex h-12 items-center justify-center rounded-xl border border-[#12374f]/15 bg-white px-6 font-semibold text-[#12374f] hover:bg-slate-50">Já tenho conta</Link>
            </div>
          </div>
          <AgendaPreview />
        </div>
      </section>

      <section id="funcionalidades" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-[#12374f]">Feito para a rotina de quem agenda</h2>
            <p className="mt-3 text-slate-600">Menos planilha, telefone e grupo de mensagem. A equipe trabalha na mesma agenda, em tempo real, no computador ou no celular.</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(f => <article key={f.title} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_10px_40px_rgba(18,55,79,.06)]">
              <span className="grid size-11 place-items-center rounded-xl bg-[#eaf3f1] text-[#12857f]"><Icon name={f.icon} /></span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{f.text}</p>
            </article>)}
          </div>
        </div>
      </section>

      <section id="para-quem" className="scroll-mt-20 bg-[#f6faf9] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-[#12374f]">Para quem é</h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {audiences.map(a => <article key={a.title} className={`rounded-2xl border bg-white p-6 ${"tag" in a ? "border-[#12857f]/40 shadow-[0_10px_40px_rgba(18,133,127,.12)]" : "border-slate-100"}`}>
              {"tag" in a && <span className="mb-3 inline-flex rounded-full bg-[#12857f] px-2.5 py-0.5 text-xs font-semibold text-white">{a.tag}</span>}
              <h3 className="text-lg font-semibold text-slate-900">{a.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{a.text}</p>
            </article>)}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-[#12374f]">Como funciona</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => <li key={s.title} className="rounded-2xl border border-slate-100 p-6">
              <span className="grid size-9 place-items-center rounded-full bg-[#12374f] text-sm font-semibold text-white">{i + 1}</span>
              <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{s.text}</p>
            </li>)}
          </ol>
        </div>
      </section>

      <section id="seguranca" className="scroll-mt-20 bg-[#12374f] py-16 text-white sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Dados de saúde pedem cuidado</h2>
            <p className="mt-3 text-white/75">A segurança vem antes de qualquer funcionalidade nova.</p>
          </div>
          <ul className="space-y-3">
            {security.map(item => <li key={item} className="flex gap-3 rounded-xl bg-white/5 p-4 text-sm leading-6 text-white/90">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#7fd8cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
              <span>{item}</span>
            </li>)}
          </ul>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-[#12374f]">Pronto para organizar as agendas?</h2>
          <p className="mt-3 text-slate-600">Crie a conta da sua organização e convide a equipe.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/cadastro" className="inline-flex h-12 items-center justify-center rounded-xl bg-[#12857f] px-6 font-semibold text-white hover:bg-[#0f7570]">Criar conta</Link>
            <Link href="/entrar" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 px-6 font-semibold text-[#12374f] hover:bg-slate-50">Entrar</Link>
          </div>
        </div>
      </section>
    </main>

    <footer className="border-t border-slate-100 bg-[#f6faf9]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo />
        <nav aria-label="Documentos" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
          <a href="/termos" className="hover:text-[#12857f]">Termos de uso</a>
          <a href="/privacidade" className="hover:text-[#12857f]">Política de privacidade</a>
          <a href="/contrato-operador" className="hover:text-[#12857f]">Contrato de tratamento de dados</a>
        </nav>
        <p className="text-sm text-slate-500">© {new Date().getFullYear()} RN Assessoria</p>
      </div>
    </footer>
  </div>;
}
