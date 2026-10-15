import { Check, ChevronDown, createElement, Download, Languages, Moon, Palette, Plus, RotateCcw, SlidersHorizontal, Sun, TextAlignCenter, TextAlignEnd, TextAlignStart, Type, X } from 'lucide';
import type { IconNode, SVGProps } from 'lucide';

function iconSvg(node: IconNode, attributes: SVGProps = {}): string {
  return createElement(node, {
    'aria-hidden': 'true',
    focusable: 'false',
    'stroke-width': 1.75,
    ...attributes,
  }).outerHTML;
}

export const icons = {
  pen: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 18c4-9 7-12 11-12-1 5-4 9-8 10l-3 2Zm3-2 5-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  type: iconSvg(Type),
  alignLeft: iconSvg(TextAlignStart),
  alignCenter: iconSvg(TextAlignCenter),
  alignRight: iconSvg(TextAlignEnd),
  settings: iconSvg(SlidersHorizontal),
  palette: iconSvg(Palette),
  plus: iconSvg(Plus),
  replay: iconSvg(RotateCcw),
  download: iconSvg(Download),
  languages: iconSvg(Languages),
  sun: iconSvg(Sun),
  moon: iconSvg(Moon),
  check: iconSvg(Check),
  close: iconSvg(X),
};

export function getSelectChevron(color: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(iconSvg(ChevronDown, { stroke: color }))}")`;
}
