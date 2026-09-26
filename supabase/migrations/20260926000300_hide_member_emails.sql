-- Wazu Finance — l'email d'un membre n'est plus lisible par les autres
--
-- users_select_self_or_covisible laisse lire la ligne users de tout membre d'un groupe commun, pour afficher son nom et son visage. Mais le privilège était accordé sur la table entière (20260904000200_policies.sql) : un co-membre lisait aussi l'email, que rien dans l'app ne montre aux autres et qui suffit à démarcher ou à usurper quelqu'un.
--
-- Une policy choisit des lignes, pas des colonnes : le privilège de lecture est donc restreint aux colonnes d'affichage. L'email reste lisible par son titulaire là où il a toujours été la source de vérité, dans la session Supabase Auth (auth.users), et les fonctions SECURITY DEFINER qui en ont besoin le lisent toujours.
--
-- Les versions de l'app antérieures à cette migration demandent users.email (réglages, liste des membres) et reçoivent 42501 sur ces écrans : pousser la migration une fois le nouveau code installé.

revoke select on public.users from anon, authenticated;
grant select (id, display_name, avatar, created_at) on public.users to authenticated;
