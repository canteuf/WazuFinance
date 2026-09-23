/**
 * Régénère les avatars de assets/avatars/ (a01.png à a16.png).
 *
 * Les visages viennent du style Avataaars de DiceBear (Pablo Stanley, libre pour un usage personnel et commercial), rastérisés en PNG par resvg. Chaque avatar fixe tout ce qui se voit — coiffure, teinte, tenue, expression, lunettes, barbe — au lieu de dépendre d'une graine : un identifiant donne toujours le même visage, quelle que soit la version de la bibliothèque, et les teintes sont réparties à dessein plutôt que tirées au hasard.
 *
 * Pour en ajouter un : une nouvelle ligne dans PRESETS avec l'identifiant suivant, régénérer, puis ajouter l'image à `src/components/ui/avatar-sources.ts` et l'identifiant à `src/lib/avatars.ts`. Ne jamais modifier une ligne existante : son identifiant est déjà enregistré dans des profils, et le visage de quelqu'un changerait sous ses yeux.
 *
 * Les trois paquets ne sont volontairement pas dans package.json : EAS lance `npm ci --include=dev`, et ce script ne sert qu'à ajouter un avatar. Les installer dans un dossier temporaire, y copier ce fichier, puis lancer :
 *
 *   npm install @dicebear/core @dicebear/styles @resvg/resvg-js
 *   node gen-avatars.mjs <chemin du dossier assets/avatars du projet>
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Installés à part, volontairement absents de package.json : voir l'en-tête.
/* eslint-disable import/no-unresolved */
import { Avatar, Style } from '@dicebear/core';
import { Resvg } from '@resvg/resvg-js';
/* eslint-enable import/no-unresolved */

// `require` plutôt qu'un import JSON avec attribut : l'ESLint du projet ne lit pas la syntaxe `with { type: 'json' }`.
const avataaars = createRequire(import.meta.url)('@dicebear/styles/avataaars.json');

const OUTPUT_WIDTH = 256;

// Teintes de peau du style, de la plus foncée à la plus claire. Les deux teintes orange et jaune du style, qui ne sont pas des teintes humaines, ne sont pas utilisées.
const D = '#614335';
const B = '#ae5d29';
const T = '#d08b5b';
const L = '#edb98a';
const P = '#ffdbb4';

const NO_ACCESSORY = { accessoriesProbability: 0 };
const NO_BEARD = { facialHairProbability: 0 };
const glasses = (variant) => ({ accessoriesProbability: 100, accessoriesVariant: [variant], accessoriesColor: ['#262e33'] });
const beard = (variant, color) => ({ facialHairProbability: 100, facialHairVariant: [variant], facialHairColor: [color] });

const PRESETS = [
  { id: 'a01', skin: D, top: 'shortFlat', hair: '#2c1b18', clothes: 'shirtCrewNeck', clothesColor: '#25557c', eyes: 'default', brows: 'defaultNatural', mouth: 'smile', ...NO_ACCESSORY, ...NO_BEARD },
  { id: 'a02', skin: D, top: 'bigHair', hair: '#2c1b18', clothes: 'shirtScoopNeck', clothesColor: '#ff488e', eyes: 'happy', brows: 'raisedExcitedNatural', mouth: 'smile', ...NO_ACCESSORY, ...NO_BEARD },
  { id: 'a03', skin: B, top: 'fro', hair: '#2c1b18', clothes: 'hoodie', clothesColor: '#929598', eyes: 'default', brows: 'flatNatural', mouth: 'twinkle', ...NO_ACCESSORY, ...beard('beardLight', '#2c1b18') },
  { id: 'a04', skin: B, top: 'froBand', hair: '#4a312c', clothes: 'collarAndSweater', clothesColor: '#a7ffc4', eyes: 'happy', brows: 'defaultNatural', mouth: 'smile', ...NO_ACCESSORY, ...NO_BEARD },
  { id: 'a05', skin: D, top: 'dreads01', hair: '#2c1b18', clothes: 'graphicShirt', clothesColor: '#ffffff', graphic: 'diamond', eyes: 'wink', brows: 'raisedExcitedNatural', mouth: 'smile', ...NO_ACCESSORY, ...NO_BEARD },
  { id: 'a06', skin: B, top: 'hijab', hat: '#65c9ff', clothes: 'shirtVNeck', clothesColor: '#ffffb1', eyes: 'default', brows: 'defaultNatural', mouth: 'smile', ...NO_ACCESSORY, ...NO_BEARD },
  { id: 'a07', skin: T, top: 'theCaesar', hair: '#4a312c', clothes: 'blazerAndShirt', clothesColor: '#262e33', eyes: 'default', brows: 'flatNatural', mouth: 'smile', ...NO_ACCESSORY, ...beard('beardMedium', '#4a312c') },
  { id: 'a08', skin: T, top: 'curly', hair: '#724133', clothes: 'overall', clothesColor: '#5199e4', eyes: 'happy', brows: 'defaultNatural', mouth: 'twinkle', ...NO_ACCESSORY, ...NO_BEARD },
  { id: 'a09', skin: D, top: 'bun', hair: '#2c1b18', clothes: 'hoodie', clothesColor: '#ff5c5c', eyes: 'default', brows: 'raisedExcitedNatural', mouth: 'smile', ...NO_ACCESSORY, ...NO_BEARD },
  { id: 'a10', skin: B, top: 'shortCurly', hair: '#2c1b18', clothes: 'shirtCrewNeck', clothesColor: '#65c9ff', eyes: 'default', brows: 'defaultNatural', mouth: 'smile', ...glasses('round'), ...NO_BEARD },
  { id: 'a11', skin: L, top: 'shortWaved', hair: '#a55728', clothes: 'collarAndSweater', clothesColor: '#25557c', eyes: 'default', brows: 'defaultNatural', mouth: 'smile', ...NO_ACCESSORY, ...NO_BEARD },
  { id: 'a12', skin: L, top: 'straight01', hair: '#724133', clothes: 'shirtScoopNeck', clothesColor: '#ffafb9', eyes: 'happy', brows: 'raisedExcitedNatural', mouth: 'smile', ...NO_ACCESSORY, ...NO_BEARD },
  { id: 'a13', skin: P, top: 'bob', hair: '#d6b370', clothes: 'blazerAndSweater', clothesColor: '#3c4f5c', eyes: 'default', brows: 'defaultNatural', mouth: 'smile', ...NO_ACCESSORY, ...NO_BEARD },
  { id: 'a14', skin: P, top: 'sides', hair: '#a55728', clothes: 'graphicShirt', clothesColor: '#b1e2ff', graphic: 'bear', eyes: 'wink', brows: 'raisedExcitedNatural', mouth: 'twinkle', ...NO_ACCESSORY, ...NO_BEARD },
  { id: 'a15', skin: D, top: 'shortRound', hair: '#e8e1e1', clothes: 'blazerAndShirt', clothesColor: '#3c4f5c', eyes: 'default', brows: 'flatNatural', mouth: 'smile', ...glasses('prescription01'), ...beard('beardMedium', '#e8e1e1') },
  { id: 'a16', skin: B, top: 'turban', hat: '#ff5c5c', clothes: 'shirtVNeck', clothesColor: '#ffffff', eyes: 'happy', brows: 'defaultNatural', mouth: 'smile', ...NO_ACCESSORY, ...NO_BEARD },
];

function toOptions(preset) {
  return {
    seed: preset.id,
    size: OUTPUT_WIDTH,
    topVariant: [preset.top],
    skinColor: [preset.skin],
    ...(preset.hair ? { hairColor: [preset.hair] } : {}),
    ...(preset.hat ? { hatColor: [preset.hat] } : {}),
    clothesVariant: [preset.clothes],
    clothesColor: [preset.clothesColor],
    ...(preset.graphic ? { clothesGraphicVariant: [preset.graphic] } : {}),
    eyesVariant: [preset.eyes],
    eyebrowsVariant: [preset.brows],
    mouthVariant: [preset.mouth],
    accessoriesProbability: preset.accessoriesProbability,
    ...(preset.accessoriesVariant
      ? { accessoriesVariant: preset.accessoriesVariant, accessoriesColor: preset.accessoriesColor }
      : {}),
    facialHairProbability: preset.facialHairProbability,
    ...(preset.facialHairVariant
      ? { facialHairVariant: preset.facialHairVariant, facialHairColor: preset.facialHairColor }
      : {}),
  };
}

const outputDir = process.argv[2];
if (!outputDir) {
  console.error('Usage : node gen-avatars.mjs <dossier de sortie>');
  process.exit(1);
}
mkdirSync(outputDir, { recursive: true });

const style = new Style(avataaars);
for (const preset of PRESETS) {
  const svg = new Avatar(style, toOptions(preset)).toString();
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OUTPUT_WIDTH } }).render().asPng();
  writeFileSync(join(outputDir, `${preset.id}.png`), png);
}
console.log(`${PRESETS.length} avatars écrits dans ${outputDir}`);
