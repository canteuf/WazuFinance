import { cacheDirectory, deleteAsync, moveAsync, writeAsStringAsync } from 'expo-file-system/legacy';
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
 * Le cache suffit : le système le vide quand il manque de place, et le fichier n'a plus d'usage une fois partagé.
 */

function cacheUri(name: string): string {
  if (!cacheDirectory) {
    throw new Error('Aucun dossier de cache disponible sur cet appareil.');
  }
  return cacheDirectory + name;
}

export async function saveTextFile(name: string, content: string, mimeType: string): Promise<void> {
  const uri = cacheUri(name);
  await writeAsStringAsync(uri, content);
  await share(uri, mimeType, 'public.comma-separated-values-text');
}

/**
 * Convertit le document HTML en PDF A4 (WebView d'impression du système), puis le partage.
 *
 * expo-print écrit le PDF sous un nom aléatoire : il est déplacé vers `name` avant le partage, sans quoi la pièce jointe arriverait en « 3F2A…pdf ». Le renommage est un confort, pas une condition — s'il échoue, le PDF part sous son nom d'origine plutôt que d'être perdu.
 */
export async function saveHtmlAsPdf(name: string, html: string): Promise<void> {
  const { uri: printed } = await Print.printToFileAsync({ html, ...A4 });

  let target = printed;
  try {
    const named = cacheUri(name);
    // Un export précédent du même nom ferait échouer le déplacement.
    await deleteAsync(named, { idempotent: true });
    await moveAsync({ from: printed, to: named });
    target = named;
  } catch {
    target = printed;
  }

  await share(target, 'application/pdf', 'com.adobe.pdf');
}

async function share(uri: string, mimeType: string, UTI: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
  }
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: 'Exporter les opérations' });
}
