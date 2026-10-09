/**
 * Génère toutes les images du logo (molette de coffre) à partir d'une seule géométrie, définie ici.
 *
 * La molette dit « mon argent est en sécurité, et c'est moi qui ai la combinaison » : un anneau vert à huit crans, une aiguille et un moyeu or. Les crans et le creux de l'anneau sont découpés (masque), pas peints de la couleur du fond : sur l'icône Android, c'est le calque de fond qui doit apparaître à travers, et l'icône monochrome d'Android 13 n'a qu'une couleur.
 *
 * resvg n'est pas une dépendance du projet (EAS installe tout `devDependencies` à chaque build) : on l'installe le temps de lancer le script.
 *
 *   npm install --no-save @resvg/resvg-js
 *   node scripts/gen-icons.mjs
 *
 * `assets/brand/logo.svg` est écrit aussi, pour qui voudrait reprendre le dessin dans un autre outil ; ce fichier-ci reste la référence.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/* eslint-disable import/no-unresolved */
import { Resvg } from '@resvg/resvg-js';
/* eslint-enable import/no-unresolved */

const ROOT = join(import.meta.dirname, '..');

const COLORS = {
  background: '#062019',
  dial: '#3DDC97',
  needle: '#F5B83D',
};

/** Rayon du coin des icônes carrées, en fraction du côté : celui de l'ancienne icône. */
const CORNER_RATIO = 0.24;

/**
 * La molette, dans un repère de 100 unités centré en (50, 50) : anneau de 19 à 29, huit crans de 22 à 27, aiguille vers le haut à droite.
 *
 * `id` rend le masque unique quand plusieurs molettes partagent un document ; `dial` et `needle` permettent la version monochrome.
 */
function dial({ id = 'dial', dial: dialColor = COLORS.dial, needle = COLORS.needle } = {}) {
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4;
    const x1 = 50 + 22 * Math.sin(angle);
    const y1 = 50 - 22 * Math.cos(angle);
    const x2 = 50 + 27.5 * Math.sin(angle);
    const y2 = 50 - 27.5 * Math.cos(angle);
    return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`;
  }).join('');

  return `
  <mask id="${id}-ring" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
    <circle cx="50" cy="50" r="29" fill="#fff"/>
    <circle cx="50" cy="50" r="19" fill="#000"/>
    <g stroke="#000" stroke-width="2.6" stroke-linecap="round">${ticks}</g>
  </mask>
  <circle cx="50" cy="50" r="29" fill="${dialColor}" mask="url(#${id}-ring)"/>
  <path d="M50 50 L61 39" stroke="${needle}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="50" cy="50" r="5.5" fill="${needle}"/>`;
}

/**
 * Document SVG de `size` pixels. `scale` agrandit ou réduit la molette autour du centre (1 = esquisse d'origine, anneau de 58 % du côté) ; `background` ajoute le carré arrondi, `circle` le découpe en rond (aperçu Android seulement).
 */
function svg({ size, scale = 1, background = null, shape = 'square', ...dialOptions }) {
  const back =
    background === null
      ? ''
      : shape === 'circle'
        ? `<circle cx="50" cy="50" r="50" fill="${background}"/>`
        : `<rect width="100" height="100" rx="${CORNER_RATIO * 100}" fill="${background}"/>`;
  const transform = `translate(50 50) scale(${scale}) translate(-50 -50)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${back}<g transform="${transform}">${dial(dialOptions)}</g></svg>`;
}

function writePng(relativePath, svgSource) {
  const path = join(ROOT, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  const png = new Resvg(svgSource, { fitTo: { mode: 'original' } }).render().asPng();
  writeFileSync(path, png);
  console.log(`${relativePath}`);
}

/**
 * Icône adaptative Android : le lanceur découpe une forme (rond, squircle…) dans les 72 dp centraux d'un calque de 108 dp, et la zone sûre est un cercle de 66 dp. Avec `scale` 0.72, l'anneau mesure 41,8 % du calque, soit 63 % de la partie visible : nettement dans la zone sûre, et aussi présent que sur l'icône carrée.
 */
const ADAPTIVE_SCALE = 0.72;

const outputs = {
  // iOS et web : l'icône finie, carré arrondi compris.
  'assets/images/icon.png': svg({ size: 1024, background: COLORS.background }),
  'assets/images/android-icon-foreground.png': svg({ size: 1024, scale: ADAPTIVE_SCALE, id: 'fg' }),
  'assets/images/android-icon-background.png': `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${COLORS.background}"/></svg>`,
  // Android 13+ recolore cette silhouette selon le fond d'écran : une seule couleur, le blanc.
  'assets/images/android-icon-monochrome.png': svg({ size: 1024, scale: ADAPTIVE_SCALE, id: 'mono', dial: '#FFFFFF', needle: '#FFFFFF' }),
  // L'écran de démarrage pose l'image sur son propre fond (#062019) : la molette seule, qui remplit l'image (anneau de 29 → 50).
  'assets/images/splash-icon.png': svg({ size: 1024, scale: 50 / 29, id: 'splash' }),
  'assets/images/favicon.png': svg({ size: 48, background: COLORS.background }),
  // Logo des e-mails, publié par GitHub Pages : affiché à 48 px, dessiné à 96 pour les écrans denses.
  'docs/email/logo.png': svg({ size: 96, background: COLORS.background }),
};

for (const [path, source] of Object.entries(outputs)) {
  writePng(path, source);
}

mkdirSync(join(ROOT, 'assets/brand'), { recursive: true });
writeFileSync(join(ROOT, 'assets/brand/logo.svg'), `${svg({ size: 1024, background: COLORS.background })}\n`);
console.log('assets/brand/logo.svg');

// Contrôle exigé par CLAUDE.md : premier plan sur fond, découpé en rond, réduit à 48 px — comme le verra un lanceur Android.
writePng(
  '.superpowers/icon-check-48.png',
  svg({ size: 48, scale: ADAPTIVE_SCALE * (108 / 72), background: COLORS.background, shape: 'circle', id: 'check' })
);
