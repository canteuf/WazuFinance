/**
 * Règles de la file des saisies hors ligne, sans rien de natif ni de React : ce que Jest vérifie.
 *
 * Le branchement sur TanStack Query vit dans `use-transaction-mutations.ts` (renvoi, versions) et `use-persisted-query-cache.ts` (écriture sur le disque).
 */

/**
 * Délai avant le renvoi d'une écriture restée sans réponse : 2 s, 4 s, 8 s… jusqu'à une minute, jamais plus. Sur un réseau 2G qui vacille, NetInfo dit « connecté » alors que les requêtes échouent : sans renvoi, la saisie partait en erreur et quittait la file.
 */
export function transportRetryDelay(attempt: number): number {
  return Math.min(2_000 * 2 ** attempt, 60_000);
}

/**
 * Vrai quand une écriture a buté sur le réseau et attend d'être renvoyée : la feuille peut alors se fermer, la saisie est en file.
 *
 * `failureCount` seul ne suffit pas : query-core le passe aussi à 1 quand il abandonne une écriture sans la renvoyer (un refus de la base). La feuille se fermait alors sur « gardée sur le téléphone » alors que rien n'était gardé, et la saisie était perdue. Seule une écriture encore `pending` est en file.
 */
export function isRetryingWrite(state: { status: string; failureCount: number }): boolean {
  return state.status === 'pending' && state.failureCount > 0;
}

/**
 * Versions que les modifications de cette session ont elles-mêmes remplacées, par opération.
 *
 * Deux modifications de la même opération faites hors ligne partent toutes deux de la version lue avant la première. Envoyées dans l'ordre, la seconde trouverait la ligne déjà changée — par soi — et serait refusée comme un conflit. Elle suit donc la chaîne des versions que l'app a produites, et ne bute que sur un changement venu d'ailleurs.
 */
export class VersionChain {
  private readonly next = new Map<string, string>();

  /** La version à attendre en base pour `id`, en partant de celle que le formulaire a lue. */
  resolve(id: string, read: string | undefined): string | undefined {
    let version = read;
    const seen = new Set<string>();
    while (version !== undefined && !seen.has(version)) {
      seen.add(version);
      const following = this.next.get(`${id}@${version}`);
      if (following === undefined) {
        break;
      }
      version = following;
    }
    return version;
  }

  /** Une modification de cette session a fait passer `id` de `from` à `to`. */
  record(id: string, from: string, to: string): void {
    this.next.set(`${id}@${from}`, to);
  }
}

/** Les champs qu'une modification d'opération écrit, sous leur nom en base. */
export type TransactionFields = {
  category_id: string | null;
  type: string;
  amount: number;
  occurred_on: string;
  note: string | null;
  wallet_id: string | null;
  /** Absent d'une ligne lue avant les étiquettes. */
  tags?: string[];
};

/**
 * Vrai quand la ligne en base porte déjà ce que la modification voulait écrire.
 *
 * Une modification arrivée en base dont la réponse s'est perdue est rejouée plus tard, parfois après un redémarrage qui a effacé la chaîne des versions : elle trouve alors une version plus récente que celle qu'elle attend — la sienne. Si les valeurs sont déjà les bonnes, ce n'est pas un conflit, c'est un renvoi. `wallet_id` ou `tags` absents du patch (modification mise en file avant les portefeuilles ou les étiquettes) ne sont pas comparés. Le montant est comparé en nombre : PostgREST peut rendre un numeric en chaîne.
 */
export function patchIsApplied(
  row: TransactionFields,
  patch: Omit<TransactionFields, 'wallet_id'> & { wallet_id?: string | null }
): boolean {
  const rowTags = row.tags ?? [];
  return (
    row.category_id === patch.category_id &&
    row.type === patch.type &&
    Number(row.amount) === Number(patch.amount) &&
    row.occurred_on === patch.occurred_on &&
    (row.note ?? null) === (patch.note ?? null) &&
    // `null` demande le portefeuille par défaut, que la base choisit : la ligne en porte alors un, quel qu'il soit.
    (patch.wallet_id === undefined || patch.wallet_id === null || row.wallet_id === patch.wallet_id) &&
    // Absentes d'une modification mise en file avant les étiquettes : elles ne sont pas comparées.
    (patch.tags === undefined ||
      (patch.tags.length === rowTags.length && patch.tags.every((tag, index) => rowTags[index] === tag)))
  );
}

// Forme du cache écrit par @tanstack/react-query-persist-client, réduite à ce que ces fonctions lisent. Tout le reste est recopié tel quel.
type PersistedMutation = { mutationKey?: readonly unknown[]; state: { status: string; isPaused: boolean } };
type PersistedQuery = { queryKey: readonly unknown[]; state: { data?: unknown } };
export type PersistedCache = {
  buster: string;
  timestamp: number;
  clientState: { mutations: PersistedMutation[]; queries: PersistedQuery[] };
};

/** Pages d'un historique gardées sur le disque. Les suivantes se rechargent en défilant ; les garder toutes, par filtre, trente jours durant, approchait la limite de 6 Mo d'AsyncStorage sur Android. */
export const PERSISTED_HISTORY_PAGES = 2;

function isInfiniteData(data: unknown): data is { pages: unknown[]; pageParams: unknown[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { pages?: unknown }).pages) &&
    Array.isArray((data as { pageParams?: unknown }).pageParams)
  );
}

/**
 * Le cache tel qu'il part sur le disque.
 *
 * Une écriture en cours d'envoi est enregistrée comme si elle était en pause. La bibliothèque n'écrit d'ordinaire que les pauses, et au démarrage ne relance que les pauses : une saisie qui partait au moment où Android a tué l'app était absente du disque, donc perdue. Relancée, elle ne crée pas de doublon — la création est un `insert … on conflict do nothing`, la modification porte sa version attendue.
 *
 * Les historiques (requêtes à pages) ne gardent que leurs premières pages.
 */
export function prepareForDisk<T extends PersistedCache>(cache: T): T {
  return {
    ...cache,
    clientState: {
      ...cache.clientState,
      mutations: cache.clientState.mutations.map((mutation) =>
        mutation.state.status === 'pending' && !mutation.state.isPaused
          ? { ...mutation, state: { ...mutation.state, isPaused: true } }
          : mutation
      ),
      queries: cache.clientState.queries.map((query) => {
        const data = query.state.data;
        if (!isInfiniteData(data) || data.pages.length <= PERSISTED_HISTORY_PAGES) {
          return query;
        }
        return {
          ...query,
          state: {
            ...query.state,
            data: {
              pages: data.pages.slice(0, PERSISTED_HISTORY_PAGES),
              pageParams: data.pageParams.slice(0, PERSISTED_HISTORY_PAGES),
            },
          },
        };
      }),
    },
  };
}

/**
 * Le cache relu, pour une app dont la version (le `buster`) a pu changer depuis son écriture.
 *
 * Une nouvelle version peut changer la forme des données affichées : les requêtes relues sont alors jetées. Les saisies en file, elles, sont gardées et remises au format courant — une mise à jour installée par-dessus des saisies pas encore envoyées ne doit pas les perdre. Leurs variables sont de simples objets, que les écritures savent relire depuis plusieurs versions (un portefeuille absent vaut « par défaut »).
 */
export function keepQueueAcrossVersions<T extends PersistedCache>(cache: T, buster: string): T {
  if (cache.buster === buster) {
    return cache;
  }
  return {
    ...cache,
    buster,
    clientState: { ...cache.clientState, queries: [] },
  };
}

type RowWithId = { id: string; category_id?: string | null; category?: unknown };

function isRow(value: unknown, id: string): value is RowWithId {
  return typeof value === 'object' && value !== null && (value as { id?: unknown }).id === id;
}

/**
 * Une donnée en cache — une liste, les pages d'un historique, ou la fiche d'une opération — où la ligne `saved.id` prend les valeurs que la base vient d'enregistrer.
 *
 * Après une modification, le cache n'était qu'invalidé : si le réseau tombait avant le rechargement et qu'Android tuait l'app, la liste relue du disque montrait l'ancienne version. Le formulaire rouvert partait de celle-ci, et la correction suivante était refusée comme « modifiée par un autre membre ». Reporter la ligne tout de suite garde le cache, et le disque, sur la bonne version.
 *
 * `category` est la catégorie jointe par les listes : gardée si elle n'a pas changé, sinon remplacée par celle que l'appelant a trouvée (ou `null` s'il n'en connaît pas, le rechargement la rétablira). Toute autre forme de donnée (un total, une `Map`) est rendue telle quel.
 */
export function mergeSavedRow(data: unknown, saved: RowWithId, category: unknown): unknown {
  const merge = (row: RowWithId): RowWithId => ({
    ...row,
    ...saved,
    category: row.category_id === saved.category_id ? row.category : category,
  });
  const inList = (rows: unknown[]): unknown[] =>
    rows.some((row) => isRow(row, saved.id))
      ? rows.map((row) => (isRow(row, saved.id) ? merge(row) : row))
      : rows;

  if (Array.isArray(data)) {
    const next = inList(data);
    return next === data ? data : next;
  }
  if (isInfiniteData(data)) {
    const pages = data.pages.map((page) => (Array.isArray(page) ? inList(page) : page));
    return pages.every((page, index) => page === data.pages[index]) ? data : { ...data, pages };
  }
  if (isRow(data, saved.id) && 'updated_at' in data) {
    return merge(data);
  }
  return data;
}

/**
 * Le cache relu, quand son âge le ferait jeter tout entier.
 *
 * La bibliothèque efface un cache plus vieux que `maxAge` — saisies en file comprises. Or cet âge se mesure à l'horloge du téléphone : une batterie retirée ramène l'heure en arrière, les saisies sont datées de ce passé, puis le réseau remet l'heure juste et le cache paraît avoir des mois. Les données lues, elles, peuvent partir : elles se rechargent. Les saisies en file ne sont nulle part ailleurs ; elles sont gardées, avec un horodatage remis à maintenant pour que la bibliothèque ne les jette pas.
 *
 * Un cache encore frais, ou sans saisie en file, est rendu tel quel : la bibliothèque décide alors comme d'habitude.
 */
export function rescueExpiredQueue<T extends PersistedCache>(cache: T, now: number, maxAge: number): T {
  if (now - cache.timestamp <= maxAge) {
    return cache;
  }
  const mutations = cache.clientState.mutations.filter((mutation) => mutation.state.status === 'pending');
  if (mutations.length === 0) {
    return cache;
  }
  return { ...cache, timestamp: now, clientState: { ...cache.clientState, mutations, queries: [] } };
}

/**
 * Ce qui reste d'un cache quand son utilisateur se déconnecte : ses seules saisies en file, sans aucune donnée lue.
 *
 * Elles partiront à sa prochaine connexion sur ce téléphone. `null` quand il n'y a rien à garder : le cache est alors effacé entièrement.
 */
export function queueOnly<T extends PersistedCache>(cache: T): T | null {
  const mutations = cache.clientState.mutations.filter((mutation) => mutation.state.status === 'pending');
  if (mutations.length === 0) {
    return null;
  }
  return { ...cache, clientState: { ...cache.clientState, mutations, queries: [] } };
}
