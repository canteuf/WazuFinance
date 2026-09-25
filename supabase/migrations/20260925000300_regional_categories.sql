-- Wazu Finance — catégories par défaut adaptées à la zone CFA
--
-- Les quatorze catégories d'origine décrivaient un ménage européen : ni tontine, ni aide à la famille, ni frais de mobile money, ni crédit téléphone. Dès la première saisie, l'utilisateur lisait « ce n'est pas pour moi ». Elles restent toutes : les opérations et les budgets existants les référencent.
--
-- Les icônes ne reprennent ni une icône du seed d'origine ni une de celles proposées pour une catégorie personnalisée (src/components/transaction/category-icons.ts) : categoryTone() colore les catégories par défaut d'après leur icône, et une catégorie personnalisée qui partagerait la sienne prendrait sa couleur.
--
-- Un groupe qui a déjà créé l'une de ces catégories lui-même (« Tontine », par exemple) ne voit pas de doublon : l'app masque la catégorie par défaut quand le groupe en a une du même nom et du même type (hideShadowedDefaults, src/lib/category-name.ts). Sa catégorie à lui garde ses opérations et ses budgets. La garde categories_guard_homonym ne s'applique pas ici : elle ne vérifie que les catégories d'un groupe.
--
-- Idempotent, comme le seed d'origine : rejouable sans dupliquer.

insert into public.categories (group_id, name, icon, type) values
  (null, 'Tontine',            'account-group',           'expense'),
  (null, 'Famille',            'human-male-female-child', 'expense'),
  (null, 'Crédit & data',      'signal-cellular-3',       'expense'),
  (null, 'Eau & électricité',  'transmission-tower',      'expense'),
  (null, 'Frais mobile money', 'bank-transfer-out',       'expense'),
  (null, 'Cérémonies',         'party-popper',            'expense'),
  (null, 'Dons & église',      'church',                  'expense'),
  (null, 'Dettes',             'handshake-outline',       'expense'),
  (null, 'Commerce',           'storefront-outline',      'income'),
  (null, 'Transfert reçu',     'bank-transfer-in',        'income'),
  (null, 'Tontine reçue',      'account-cash',            'income')
on conflict (name, type) where group_id is null do nothing;
