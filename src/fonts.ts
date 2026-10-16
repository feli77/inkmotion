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

// All assets use the same stroke JSON format, including converted SVG fonts.
export const fonts: readonly FontDefinition[] = [
  { id: 'satisfy', name: 'Satisfy', nameKey: 'font.satisfy', url: '/fonts/satisfy.json', source: varaSource },
  { id: 'pacifico', name: 'Pacifico', nameKey: 'font.pacifico', url: '/fonts/pacifico.json', source: varaSource },
  { id: 'parisienne', name: 'Parisienne', nameKey: 'font.parisienne', url: '/fonts/parisienne.json', source: varaSource },
  { id: 'shadows-into-light', name: 'Shadows Into Light', nameKey: 'font.shadowsIntoLight', url: '/fonts/shadows-into-light.json', source: varaSource },
  { id: 'ems-tech', name: 'EMS Tech', nameKey: 'font.emsTech', url: '/fonts/ems-tech.json', source: emsSource },
  { id: 'ems-nixish', name: 'EMS Nixish', nameKey: 'font.emsNixish', url: '/fonts/ems-nixish.json', source: emsSource },
  { id: 'relief-singleline', name: 'Relief SingleLine', nameKey: 'font.reliefSingleLine', url: '/fonts/relief-singleline.json', source: reliefSource },
];
