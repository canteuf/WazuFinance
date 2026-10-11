-- Suppression d'un compte depuis le tableau de bord Supabase.
--
-- Le tableau de bord (et l'API d'administration de Supabase Auth) supprime la ligne de auth.users sous le rôle supabase_auth_admin. La cascade efface le profil, puis les adhésions ; les triggers AFTER DELETE de account_memberships s'exécutent alors sous ce même rôle, à pg_trigger_depth() = 1 comme une action directe. revoke_invitations_on_member_change() était SECURITY INVOKER : son update de group_invitations levait « permission denied for table group_invitations », et toute la suppression échouait dès que l'utilisateur appartenait à un groupe (« Database error deleting user »). Or c'est la voie de secours de la page de suppression de compte, pour qui n'a plus l'app.
--
-- SECURITY DEFINER, comme log_activity() et remember_former_member() : le trigger ne fait que révoquer les codes du groupe dont l'adhésion vient de changer, une modification que RLS a déjà autorisée. auth.uid() vaut NULL sous supabase_auth_admin : le départ compte comme une exclusion, et les codes actifs du groupe sont révoqués, ce qui est le choix prudent. Corps inchangé (20260929000100_invitation_and_replay_hardening.sql).

alter function public.revoke_invitations_on_member_change() security definer;
