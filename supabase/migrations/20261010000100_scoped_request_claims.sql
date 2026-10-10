-- Wazu Finance — la marque d'un geste appartient à celui qui l'a fait
--
-- applied_requests avait pour clé l'identifiant du geste seul, commun à tous les comptes. claim_request() est appelable par tout client (adjust_budget_amount() est SECURITY INVOKER et l'appelle sous l'identité de l'utilisateur) : un compte qui aurait connu l'identifiant d'un geste d'un autre aurait pu le marquer avant lui, et l'ajustement de plafond de l'autre aurait été ignoré sans erreur. L'identifiant est tiré au hasard sur le téléphone et n'est jamais montré à personne, donc rien de praticable (campagne de tests du 10 octobre 2026) ; la clé devient tout de même (user_id, id), et la marque d'un compte ne peut plus toucher aux gestes d'un autre.

alter table public.applied_requests drop constraint applied_requests_pkey;
alter table public.applied_requests add primary key (user_id, id);

-- Corps inchangé (20260926000400_idempotent_deltas.sql), sauf la cible du conflit.
create or replace function public.claim_request(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  delete from public.applied_requests
   where user_id = auth.uid()
     and created_at < now() - interval '30 days';

  insert into public.applied_requests (id, user_id)
  values (p_id, auth.uid())
  on conflict (user_id, id) do nothing;

  return found;
end;
$$;

revoke all on function public.claim_request(uuid) from public, anon;
grant execute on function public.claim_request(uuid) to authenticated;
