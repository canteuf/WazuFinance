-- Wazu Finance — catégories par défaut (spec 2.3)
--
-- group_id NULL = catégorie globale, en lecture seule pour tous les
-- utilisateurs. Les catégories personnalisées sont créées avec un group_id.
--
-- `icon` stocke un nom d'icône MaterialCommunityIcons (@expo/vector-icons).
-- Idempotent : rejouable sans dupliquer.

insert into public.categories (group_id, name, icon, type) values
  (null, 'Alimentation',   'cart',              'expense'),
  (null, 'Logement',       'home',              'expense'),
  (null, 'Transport',      'car',               'expense'),
  (null, 'Loisirs',        'movie-open',        'expense'),
  (null, 'Santé',          'heart-pulse',       'expense'),
  (null, 'Restaurants',    'silverware-fork-knife', 'expense'),
  (null, 'Abonnements',    'repeat',            'expense'),
  (null, 'Vêtements',      'tshirt-crew',       'expense'),
  (null, 'Éducation',      'school',            'expense'),
  (null, 'Divers',         'dots-horizontal',   'expense'),
  (null, 'Salaire',        'cash',              'income'),
  (null, 'Remboursement',  'cash-refund',       'income'),
  (null, 'Cadeau',         'gift',              'income'),
  (null, 'Autres revenus', 'plus-circle',       'income')
on conflict (name, type) where group_id is null do nothing;
