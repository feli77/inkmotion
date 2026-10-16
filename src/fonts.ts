import type { MessageKey } from './i18n';

export interface FontDefinition {
  id: string;
  name: string;
  nameKey: MessageKey;
  url: string;
  source: { name: string; url: string };
}

const varaSource = { name: 'Vara.js', url: 'https://github.com/akzhy/Vara' };
const emsSource = { name: 'Evil Mad Scientist', url: 'https://gitlab.com/oskay/svg-fonts' };
const reliefSource = { name: 'isdaT', url: 'https://github.com/isdat-type/Relief-SingleLine' };
const tegakiSource = (font: string) => ({
  name: 'Tegaki',
  url: `https://github.com/gkurt/tegaki/tree/32654a4cfb0fa6a2873264cf693316acd59d1627/packages/renderer/fonts/${font}`,
});

// Sampled fonts extend the stroke JSON with native widths; all assets stay local.
export const fonts: readonly FontDefinition[] = [
  { id: 'satisfy', name: 'Satisfy', nameKey: 'font.satisfy', url: '/fonts/satisfy.json', source: varaSource },
  { id: 'caveat', name: 'Caveat', nameKey: 'font.caveat', url: '/fonts/caveat.json', source: tegakiSource('caveat') },
  { id: 'tangerine', name: 'Tangerine', nameKey: 'font.tangerine', url: '/fonts/tangerine.json', source: tegakiSource('tangerine') },
  { id: 'italianno', name: 'Italianno', nameKey: 'font.italianno', url: '/fonts/italianno.json', source: tegakiSource('italianno') },
  { id: 'ink-flourish', name: 'Ink Flourish', nameKey: 'font.inkFlourish', url: '/fonts/ink-flourish.json', source: tegakiSource('parisienne') },
  { id: 'pacifico', name: 'Pacifico', nameKey: 'font.pacifico', url: '/fonts/pacifico.json', source: varaSource },
  { id: 'parisienne', name: 'Parisienne', nameKey: 'font.parisienne', url: '/fonts/parisienne.json', source: varaSource },
  { id: 'shadows-into-light', name: 'Shadows Into Light', nameKey: 'font.shadowsIntoLight', url: '/fonts/shadows-into-light.json', source: varaSource },
  { id: 'ems-tech', name: 'EMS Tech', nameKey: 'font.emsTech', url: '/fonts/ems-tech.json', source: emsSource },
  { id: 'ems-nixish', name: 'EMS Nixish', nameKey: 'font.emsNixish', url: '/fonts/ems-nixish.json', source: emsSource },
  { id: 'relief-singleline', name: 'Relief SingleLine', nameKey: 'font.reliefSingleLine', url: '/fonts/relief-singleline.json', source: reliefSource },
];
