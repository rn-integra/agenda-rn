-- Suporte RN Integra, fase 2: o console pode silenciar o aviso de um incidente por um tempo.
-- Silenciado, o incidente continua aberto e contando repetições, mas não manda aviso de novo.
-- Exceção de segurança: se piorar (ex.: de atenção para crítico), avisa mesmo silenciado.

alter table public.monitor_incidents add column if not exists snoozed_until timestamptz;

create or replace function public.record_monitor_incident(p_fingerprint text,p_environment text,p_source text,p_severity text,
  p_title text,p_detail text,p_route text,p_org uuid,p_playbook text default null,p_auto_fix text default null,
  p_min_occurrences integer default 1) returns jsonb
language plpgsql set search_path='' as $$
declare inc public.monitor_incidents; throttle interval; alert boolean:=false; previous text; worse boolean;
begin
 select severity into previous from public.monitor_incidents where fingerprint=left(p_fingerprint,200) and resolved_at is null;
 insert into public.monitor_incidents(fingerprint,environment,source,severity,title,detail,route,organization_id,playbook,auto_fix)
 values(left(p_fingerprint,200),p_environment,p_source,p_severity,left(p_title,300),left(p_detail,2000),left(p_route,200),p_org,left(p_playbook,40),p_auto_fix)
 on conflict (fingerprint) where resolved_at is null do update set
   occurrences=public.monitor_incidents.occurrences+1,
   last_seen=now(),
   severity=case when public.monitor_severity_rank(excluded.severity)>public.monitor_severity_rank(public.monitor_incidents.severity)
                 then excluded.severity else public.monitor_incidents.severity end,
   title=excluded.title,
   detail=coalesce(excluded.detail,public.monitor_incidents.detail),
   playbook=coalesce(excluded.playbook,public.monitor_incidents.playbook),
   auto_fix=excluded.auto_fix
 returning * into inc;
 throttle:=case inc.severity when 'critical' then interval '1 hour' when 'error' then interval '6 hours' when 'warning' then interval '24 hours' end;
 worse:=public.monitor_severity_rank(inc.severity)>public.monitor_severity_rank(coalesce(previous,inc.severity));
 if throttle is not null and inc.occurrences>=greatest(coalesce(p_min_occurrences,1),1)
    and (worse or ((inc.snoozed_until is null or inc.snoozed_until<now()) and (inc.alerted_at is null or inc.alerted_at<now()-throttle))) then
   update public.monitor_incidents set alerted_at=now() where id=inc.id;
   alert:=true;
 end if;
 return jsonb_build_object('id',inc.id,'occurrences',inc.occurrences,'severity',inc.severity,'alert',alert,'new',inc.occurrences=1);
end;$$;

revoke all on function public.record_monitor_incident(text,text,text,text,text,text,text,uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.record_monitor_incident(text,text,text,text,text,text,text,uuid,text,text,integer) to service_role;
