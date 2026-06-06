import figlet from 'figlet';
import type { Fonts } from 'figlet';

export const FIGLET_FONTS = ['Standard', 'Big', 'Small', 'Banner', 'Doom', 'Slant', 'Block'] as const;
export type FigletFont = typeof FIGLET_FONTS[number];

export function figletText(text: string, font: FigletFont): Promise<string> {
  return new Promise((resolve, reject) => {
    figlet.text(text, { font }, (err, result) => {
      if (err) reject(err);
      else resolve(result ?? '');
    });
  });
}