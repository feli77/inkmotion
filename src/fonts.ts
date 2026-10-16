import type { MessageKey } from './i18n';

export interface FontDefinition {
  id: string;
  name: string;
  nameKey: MessageKey;
  url: string;
}

// Fonts use Vara's stroke JSON format; adding a font only needs a registry entry.
export const fonts: readonly FontDefinition[] = [
  { id: 'satisfy', name: 'Satisfy', nameKey: 'font.satisfy', url: '/fonts/satisfy.json' },
  { id: 'pacifico', name: 'Pacifico', nameKey: 'font.pacifico', url: '/fonts/pacifico.json' },
  { id: 'parisienne', name: 'Parisienne', nameKey: 'font.parisienne', url: '/fonts/parisienne.json' },
  { id: 'shadows-into-light', name: 'Shadows Into Light', nameKey: 'font.shadowsIntoLight', url: '/fonts/shadows-into-light.json' },
];
