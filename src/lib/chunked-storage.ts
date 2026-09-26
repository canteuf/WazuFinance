/**
 * Une valeur longue rangée en morceaux dans un stockage clé-valeur qui limite la taille de chaque valeur (SecureStore sur Android : environ 2 Ko). Rien de natif ici : `secure-session-storage.ts` y branche SecureStore, Jest un simple objet.
 *
 * Deux jeux de morceaux, `a` et `b`, et un pointeur qui dit lequel est le bon et combien il en compte (`a:5`). Une écriture remplit le jeu qui n'est pas pointé, puis bascule le pointeur, en une seule écriture, et seulement alors efface l'ancien jeu. Tuée à n'importe quel moment, elle laisse le pointeur sur un jeu complet : l'ancienne valeur ou la nouvelle, jamais un mélange des deux.
 *
 * La version précédente réécrivait les morceaux sur place avant le compteur : une écriture interrompue au milieu laissait les premiers morceaux de la nouvelle session suivis des derniers de l'ancienne, sous l'ancien compteur, et la session relue était illisible.
 */

export type KeyValueStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

type Slot = 'a' | 'b';

type Pointer = { slot: Slot; count: number };

/** 2 048 octets maximum par valeur, et un caractère peut en prendre jusqu'à 4 en UTF-8 : 500 caractères tiennent toujours. */
export const CHUNK_SIZE = 500;

// Les stockages sécurisés n'acceptent que lettres, chiffres, « . », « - » et « _ ».
const pointerKey = (key: string) => `${key}.slot`;
const chunkKey = (key: string, slot: Slot, index: number) => `${key}.${slot}.${index}`;

// Format de la version précédente, un seul jeu écrit sur place : relu une fois, puis remplacé.
const legacyCountKey = (key: string) => `${key}.count`;
const legacyChunkKey = (key: string, index: number) => `${key}.${index}`;

function parsePointer(raw: string | null): Pointer | null {
  const match = raw?.match(/^([ab]):(\d+)$/);
  if (!match) {
    return null;
  }
  const count = Number(match[2]);
  return count > 0 ? { slot: match[1] as Slot, count } : null;
}

async function readParts(
  store: KeyValueStore,
  count: number,
  keyAt: (index: number) => string
): Promise<string | null> {
  const parts: string[] = [];
  for (let index = 0; index < count; index++) {
    const part = await store.get(keyAt(index));
    if (part === null) {
      return null;
    }
    parts.push(part);
  }
  return parts.join('');
}

async function removeParts(store: KeyValueStore, count: number, keyAt: (index: number) => string) {
  for (let index = 0; index < count; index++) {
    await store.remove(keyAt(index));
  }
}

async function legacyCount(store: KeyValueStore, key: string): Promise<number> {
  const count = Number(await store.get(legacyCountKey(key)));
  return Number.isInteger(count) && count > 0 ? count : 0;
}

export async function readChunked(store: KeyValueStore, key: string): Promise<string | null> {
  const pointer = parsePointer(await store.get(pointerKey(key)));
  if (pointer) {
    return readParts(store, pointer.count, (index) => chunkKey(key, pointer.slot, index));
  }
  const count = await legacyCount(store, key);
  return count > 0 ? readParts(store, count, (index) => legacyChunkKey(key, index)) : null;
}

export async function writeChunked(store: KeyValueStore, key: string, value: string): Promise<void> {
  const previous = parsePointer(await store.get(pointerKey(key)));
  const slot: Slot = previous?.slot === 'a' ? 'b' : 'a';

  const parts: string[] = [];
  for (let start = 0; start < value.length; start += CHUNK_SIZE) {
    parts.push(value.slice(start, start + CHUNK_SIZE));
  }
  for (const [index, part] of parts.entries()) {
    await store.set(chunkKey(key, slot, index), part);
  }

  // La bascule, en une seule écriture : avant elle, une lecture voit l'ancien jeu entier ; après, le nouveau.
  await store.set(pointerKey(key), `${slot}:${parts.length}`);

  // Le ménage vient après la bascule. Interrompu, il laisse des morceaux qu'aucun pointeur ne compte : inoffensifs, puisqu'une lecture s'arrête au nombre qu'indique le pointeur.
  if (previous) {
    await removeParts(store, previous.count, (index) => chunkKey(key, previous.slot, index));
  }
  const legacy = await legacyCount(store, key);
  if (legacy > 0) {
    await store.remove(legacyCountKey(key));
    await removeParts(store, legacy, (index) => legacyChunkKey(key, index));
  }
}

export async function removeChunked(store: KeyValueStore, key: string): Promise<void> {
  const pointer = parsePointer(await store.get(pointerKey(key)));
  // Le pointeur d'abord : sans lui, plus rien n'est relu, même si la suite est interrompue.
  await store.remove(pointerKey(key));
  if (pointer) {
    await removeParts(store, pointer.count, (index) => chunkKey(key, pointer.slot, index));
  }
  const legacy = await legacyCount(store, key);
  await store.remove(legacyCountKey(key));
  await removeParts(store, legacy, (index) => legacyChunkKey(key, index));
}
