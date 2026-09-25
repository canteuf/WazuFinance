-- Wazu Finance — « budget » partout dans les messages
--
-- L'app parlait tantôt de budgets (l'onglet), tantôt d'enveloppes (l'écran, les boutons). Elle dit désormais « budget » partout. adjust_budget_amount() lève un message que l'app affiche tel quel (P0001, src/lib/data-errors.ts) : il suit. Corps inchangé par ailleurs (20260925000200_savings_movements.sql).

create or replace function public.adjust_budget_amount(p_budget_id uuid, p_delta numeric)
returns public.budgets
language plpgsql
security invoker
set search_path = public
as $$
declare
  budget public.budgets;
begin
  if p_delta is null or p_delta = 0 or p_delta <> round(p_delta) then
    raise exception 'Indiquez un montant entier, différent de zéro.';
  end if;

  select * into budget from public.budgets where id = p_budget_id for update;
  if not found then
    raise exception 'Ce budget n''existe plus.';
  end if;

  if budget.amount + p_delta <= 0 then
    raise exception 'Le plafond doit rester supérieur à zéro.';
  end if;

  update public.budgets
     set amount = amount + p_delta
   where id = p_budget_id
  returning * into budget;

  return budget;
end;
$$;
