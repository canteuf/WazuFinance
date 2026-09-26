-- Wazu Finance — nouvelles valeurs d'enum pour les droits dans les groupes et le journal complet
--
-- Seules dans leur fichier : une valeur ajoutée à un enum ne peut pas servir dans la transaction qui l'ajoute, et la CLI applique chaque migration dans une transaction. Les policies, fonctions et triggers qui s'en servent sont dans les migrations suivantes.

-- Un lecteur voit tout le groupe et ne modifie rien : le membre d'une tontine qui suit la caisse sans la tenir.
alter type public.membership_role add value if not exists 'viewer';

-- Le journal couvre désormais les créations, et quatre sujets de plus.
alter type public.activity_action add value if not exists 'insert';
alter type public.activity_subject add value if not exists 'debt';
alter type public.activity_subject add value if not exists 'wallet';
alter type public.activity_subject add value if not exists 'transfer';
alter type public.activity_subject add value if not exists 'membership';
