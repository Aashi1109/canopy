import { parsePageSelection } from '../../lib/tool-framework/settings.ts';

type PageGeometry = { pageNumber: number; pageWidth: number; pageHeight: number };

export function cropPlan(settings: Readonly<Record<string, unknown>>, pages: readonly PageGeometry[]) {
  const expression = Array.isArray(settings.pages) ? settings.pages.join(',') : String(settings.pages ?? '');
  const parsed = parsePageSelection(expression, pages.length);
  const selected = parsed === 'all' ? pages.map(page => page.pageNumber) : parsed;
  if (!selected.length) throw new Error(`Choose pages from 1 to ${pages.length}.`);
  const values = ['cropX', 'cropY', 'cropWidth', 'cropHeight'].map(key => {
    const raw = settings[key];
    return typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  });
  if (values.some(value => !Number.isInteger(value))) {
    throw new Error('Enter whole-number points for Left, Bottom, Width, and Height.');
  }
  const [x, y, width, height] = values;
  if (values.some(value => !Number.isFinite(value)) || x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new Error('Enter non-negative Left and Bottom values and positive Width and Height.');
  }
  const outside = pages.find(page => selected.includes(page.pageNumber) && (x + width > page.pageWidth || y + height > page.pageHeight));
  if (outside) throw new Error(`The crop extends beyond page ${outside.pageNumber}. Reduce its position or size, or change the selected pages.`);
  return { selected, box: { x, y, width, height } };
}
