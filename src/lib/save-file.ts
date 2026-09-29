import { cacheDirectory, deleteAsync, readDirectoryAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** A4 en points : 210 × 297 mm. Sans ces dimensions, expo-print produit du format Lettre US. */
const A4 = { width: 595, height: 842 };

/**
 * Écriture et partage d'un fichier exporté.
 *
 * Le web n'a ni système de fichiers ni partage de fichier local : voir save-file.web.ts.
 *
 * API `expo-file-system/legacy` et non la nouvelle API `File`/`Paths`, délibérément : expo-sharing refuse tout fichier hors des dossiers de l'expérience en cours et rejette avec « Not allowed to read file under given URL ». Sous Expo Go, `Paths.cache` ne désigne pas ce dossier-là, alors que `cacheDirectory` si. Ne pas « moderniser » ces appels sans les avoir retestés sur un appareil, dans Expo Go comme en build natif.
 *
 * Le cache suffit : le système le vide quand il manque de place, et le fichier n'a plus d'usage une fois partagé. Il n'est pas supprimé juste après le partage : sur Android, `shareAsync` rend la main avant que l'application choisie (WhatsApp, Gmail) ait lu le fichier. `clearExportedFiles()` les efface à la déconnexion.
 */

/** Tous les exports commencent ainsi (exportFileName(), le journal, l'export des données) : c'est ce qui permet de les effacer sans toucher au reste du cache. */
const EXPORT_PREFIX = 'wazu-';

/** Type de fichier pour la feuille de partage d'iOS ; Android ne lit que le type MIME. */
const UTI_BY_MIME: Record<string, string> = {
  'text/csv': 'public.comma-separated-values-text',
  'application/json': 'public.json',
};

function cacheUri(name: string): string {
  if (!cacheDirectory) {
    throw new Error('Aucun dossier de cache disponible sur cet appareil.');
  }
  return cacheDirectory + name;
}

export async function saveTextFile(
  name: string,
  content: string,
  mimeType: 'text/csv' | 'application/json',
  dialogTitle = 'Exporter les opérations'
): Promise<void> {
  const uri = cacheUri(name);
  await writeAsStringAsync(uri, content);
  await share(uri, mimeType, UTI_BY_MIME[mimeType], dialogTitle);
}

/**
 * Convertit le document HTML en PDF A4 (WebView d'impression du système), puis le partage.
 *
 * Le PDF est récupéré en base64 et réécrit dans le cache de l'expérience, au lieu d'être repris depuis le fichier qu'expo-print vient d'écrire. Ce fichier vit dans `<cache>/Print/`, un sous-dossier qu'expo-file-system place hors du périmètre qu'il s'autorise bien qu'il soit sous le même cache : sous Expo Go, il refuse de le déplacer (« isn't movable »), de le copier (« isn't readable »), et expo-sharing refuse de le lire (« Not allowed to read file under given URL »). Aucune opération sur ce chemin n'aboutit, donc on ne le touche pas.
 *
 * `base64: true` renvoie le document en mémoire, sans passer par le système de fichiers : la seule écriture est la nôtre, à la racine du cache, exactement comme pour le CSV — qui, lui, a toujours fonctionné. Cela donne aussi son nom à la pièce jointe, qui arriverait sinon en « 3F2A…pdf ».
 *
 * Le coût est de garder le PDF en mémoire le temps de l'écriture ; un relevé d'opérations reste petit, et l'encodage base64 le gonfle d'un tiers.
 */
export async function saveHtmlAsPdf(name: string, html: string): Promise<void> {
  const { base64 } = await Print.printToFileAsync({ html, ...A4, base64: true });
  if (base64 === undefined) {
    throw new Error('Le PDF n’a pas pu être lu après sa création.');
  }

  const target = cacheUri(name);
  // Un export précédent du même nom resterait sinon en place.
  await deleteAsync(target, { idempotent: true });
  await writeAsStringAsync(target, base64, { encoding: 'base64' });

  await share(target, 'application/pdf', 'com.adobe.pdf', 'Exporter les opérations');
}

/**
 * Efface les exports restés dans le cache, et les PDF intermédiaires d'expo-print. Appelée à la déconnexion : un relevé d'opérations ou l'export complet des données ne doit pas survivre au compte qui l'a produit sur ce téléphone.
 *
 * Ne lève jamais : la déconnexion ne doit pas échouer pour un fichier introuvable. Sous Expo Go, le dossier `Print/` échappe aux droits d'expo-file-system (voir `saveHtmlAsPdf`) ; il est vidé dans un APK, où ce n'est pas le cas.
 */
export async function clearExportedFiles(): Promise<void> {
  if (!cacheDirectory) {
    return;
  }
  try {
    const names = await readDirectoryAsync(cacheDirectory);
    await Promise.all(
      names
        .filter((name) => name.startsWith(EXPORT_PREFIX))
        .map((name) => deleteAsync(cacheDirectory + name, { idempotent: true }))
    );
    await deleteAsync(`${cacheDirectory}Print`, { idempotent: true });
  } catch {
    // Voir ci-dessus.
  }
}

async function share(uri: string, mimeType: string, UTI: string | undefined, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
  }
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle });
}
