import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** A4 en points : 210 × 297 mm. Sans ces dimensions, expo-print produit du format Lettre US. */
const A4 = { width: 595, height: 842 };

/**
 * Variante native : le fichier est écrit dans le cache puis confié à la feuille de partage du système — l'utilisateur choisit où il va (Fichiers, Drive, mail, messagerie). Le cache suffit : le système le vide quand il manque de place, et le fichier n'a plus d'usage une fois partagé.
 *
 * Le web n'a ni système de fichiers ni partage de fichier local : voir save-file.web.ts.
 */
export async function saveTextFile(name: string, content: string, mimeType: string): Promise<void> {
  const file = freshCacheFile(name);
  file.create();
  file.write(content);
  await share(file, mimeType, 'public.comma-separated-values-text');
}

/**
 * Convertit le document HTML en PDF A4 (WebView d'impression du système), puis le partage.
 *
 * expo-print écrit le PDF sous un nom aléatoire : il est déplacé vers `name` avant le partage, sans quoi la pièce jointe arriverait en « 3F2A…pdf ».
 */
export async function saveHtmlAsPdf(name: string, html: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, ...A4 });
  const file = freshCacheFile(name);
  await new File(uri).move(file);
  await share(file, 'application/pdf', 'com.adobe.pdf');
}

/** Un export précédent du même nom resterait sinon en place, et create() comme move() échoueraient. */
function freshCacheFile(name: string): File {
  const file = new File(Paths.cache, name);
  if (file.exists) {
    file.delete();
  }
  return file;
}

async function share(file: File, mimeType: string, UTI: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle: 'Exporter les opérations' });
}
