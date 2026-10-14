import type { MessageKey } from './i18n';

export interface FontDefinition {
  id: string;
  nameKey: MessageKey;
  url: string;
}

// Fonts use Vara's stroke JSON format; adding a font only needs a registry entry.
export const fonts: readonly FontDefinition[] = [
  { id: 'satisfy', nameKey: 'font.satisfy', url: '/fonts/satisfy.json' },
];
