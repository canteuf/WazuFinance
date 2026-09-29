/**
 * Variante web : téléchargement direct par le navigateur. expo-file-system n'existe pas sur le web, et expo-sharing ne sait pas partager un fichier local — seulement une URL distante.
 */
export async function saveTextFile(
  name: string,
  content: string,
  mimeType: 'text/csv' | 'application/json',
  _dialogTitle?: string
): Promise<void> {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Libérée au tour suivant : certains navigateurs lisent encore l'URL juste après le clic.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Le navigateur n'a pas de conversion HTML → PDF programmable : on imprime le relevé, et la boîte d'impression propose « Enregistrer au format PDF ». `name` sert de titre de document, que Chrome et Edge reprennent comme nom de fichier proposé.
 *
 * Dans un iframe caché plutôt qu'une nouvelle fenêtre : l'export arrive après une requête réseau, hors du geste de l'utilisateur, et un `window.open` à ce moment-là serait bloqué comme popup. Même raison pour ne pas utiliser `Print.printToFileAsync`, qui sur le web imprime la page de l'app elle-même, pas ce document.
 */
export async function saveHtmlAsPdf(name: string, html: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  if (!doc || !view) {
    frame.remove();
    throw new Error('L’impression n’est pas disponible dans ce navigateur.');
  }

  doc.open();
  doc.write(html.replace(/<title>[^<]*<\/title>/, `<title>${name.replace(/\.pdf$/, '')}</title>`));
  doc.close();

  await new Promise<void>((resolve) => {
    // afterprint suit la fermeture de la boîte, impression faite ou annulée ; le délai de secours couvre les navigateurs qui ne l'émettent pas dans un iframe.
    const done = () => {
      frame.remove();
      resolve();
    };
    view.addEventListener('afterprint', done, { once: true });
    setTimeout(done, 60_000);
    view.focus();
    view.print();
  });
}

/** Rien à effacer : le navigateur a téléchargé le fichier dans son propre dossier, hors de portée de l'app. */
export async function clearExportedFiles(): Promise<void> {}
