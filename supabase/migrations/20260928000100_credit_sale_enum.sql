-- Wazu Finance — nouvelle valeur d'enum pour la vente à crédit
--
-- Seule dans son fichier, comme 20260927000100_group_roles_enums.sql : une valeur ajoutée à un enum ne peut pas servir dans la transaction qui l'ajoute. Les fonctions qui s'en servent sont dans la migration suivante.

-- credit_sale : la commerçante a vendu à crédit, le client lui doit. Rien n'entre au solde le jour de la vente ; chaque versement du client est un revenu « Commerce ».
alter type public.debt_direction add value if not exists 'credit_sale';
