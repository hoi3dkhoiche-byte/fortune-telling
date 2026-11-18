import glossary from '../i18n/vi.json';
import type { NatalChart } from './types';

/** `known` means present in our versioned glossary, not expert certification. */
export interface EntityLabel {
  id: string;
  labelVi: string;
  sourceName: string;
  known: boolean;
}

type NameEntry = { id: string; labelVi: string };
type NameTable = Record<string, NameEntry>;

export const GLOSSARY_VERSION = glossary.version;
export const GLOSSARY_NOTES: readonly string[] = Object.freeze([...glossary.notes]);

/** Unknown names keep a stable, collision-free identity without inventing a translation. */
function unknownId(namespace: string, sourceName: string): string {
  const points = Array.from(sourceName).map(char => char.codePointAt(0)!.toString(16).toUpperCase());
  return `${namespace}.UNKNOWN.U${points.join('_') || 'EMPTY'}`;
}

function lookup(table: NameTable, namespace: string, sourceName: string): EntityLabel {
  const entry = Object.prototype.hasOwnProperty.call(table, sourceName) ? table[sourceName] : undefined;
  return entry
    ? { ...entry, sourceName, known: true }
    : { id: unknownId(namespace, sourceName), labelVi: sourceName, sourceName, known: false };
}

export function labelStar(sourceName: string): EntityLabel {
  return lookup(glossary.stars, 'STAR', sourceName);
}

export function labelPalace(sourceName: string): EntityLabel {
  return lookup(glossary.palaces, 'PALACE', sourceName);
}

export function labelTransformation(sourceName: string): EntityLabel {
  return lookup(glossary.transformations, 'SIHUA', sourceName);
}

export function labelBranch(index: number): EntityLabel {
  if (!Number.isInteger(index) || index < 0 || index > 11) {
    throw new RangeError('Branch index must be an integer from 0 to 11.');
  }
  return { ...glossary.branches[index], known: true };
}

export function labelStem(index: number): EntityLabel {
  if (!Number.isInteger(index) || index < 0 || index > 9) {
    throw new RangeError('Stem index must be an integer from 0 to 9.');
  }
  return { ...glossary.stems[index], known: true };
}

export function labelBrightness(sourceName?: string): string | undefined {
  if (!sourceName) return undefined;
  const table: Record<string, string> = glossary.brightness;
  return Object.prototype.hasOwnProperty.call(table, sourceName) ? table[sourceName] : sourceName;
}

export function labelJu(value: number): EntityLabel {
  const table: NameTable = glossary.wuxingJu;
  const entry = table[String(value)];
  return entry
    ? { ...entry, sourceName: String(value), known: true }
    : { id: unknownId('JU', String(value)), labelVi: String(value), sourceName: String(value), known: false };
}

/** Adds labels while retaining every raw engine field; never mutates the input. */
export function decorateNatal(natal: NatalChart) {
  return {
    ...natal,
    wuxingJuLabelVi: labelJu(natal.wuxingJu).labelVi,
    ...(natal.mingZhu ? { mingZhuLabelVi: labelStar(natal.mingZhu).labelVi } : {}),
    ...(natal.shenZhu ? { shenZhuLabelVi: labelStar(natal.shenZhu).labelVi } : {}),
    palaces: [...natal.palaces].sort((a, b) => a.branch - b.branch).map(palace => ({
      ...palace,
      id: labelPalace(palace.name).id,
      labelVi: labelPalace(palace.name).labelVi,
      branchLabelVi: labelBranch(palace.branch).labelVi,
      stemLabelVi: labelStem(palace.stem).labelVi,
      stars: palace.stars.map(star => ({
        ...star,
        id: labelStar(star.name).id,
        labelVi: labelStar(star.name).labelVi,
        labelKnown: labelStar(star.name).known,
        ...(star.brightnessRaw ? { brightnessLabelVi: labelBrightness(star.brightnessRaw) } : {}),
        ...(star.siHua ? { siHuaLabelVi: labelTransformation(star.siHua).labelVi } : {}),
      })),
    })),
  };
}

/** Compact display dictionary referenced by semantic facts. */
export function buildLabels(natal: NatalChart) {
  const unknown = new Set<string>();
  const track = (entry: EntityLabel) => {
    if (!entry.known) unknown.add(entry.sourceName);
    return entry;
  };
  return {
    version: GLOSSARY_VERSION,
    wuxingJu: track(labelJu(natal.wuxingJu)),
    ...(natal.mingZhu ? { mingZhu: track(labelStar(natal.mingZhu)) } : {}),
    ...(natal.shenZhu ? { shenZhu: track(labelStar(natal.shenZhu)) } : {}),
    palaces: [...natal.palaces].sort((a, b) => a.branch - b.branch).map(palace => ({
      ...track(labelPalace(palace.name)),
      branch: labelBranch(palace.branch),
      stem: labelStem(palace.stem),
      stars: palace.stars.map(star => ({
        ...track(labelStar(star.name)),
        ...(star.brightnessRaw ? { brightness: { sourceName: star.brightnessRaw, labelVi: labelBrightness(star.brightnessRaw)! } } : {}),
        ...(star.siHua ? { transformation: track(labelTransformation(star.siHua)) } : {}),
      })),
    })),
    // Evaluated after tracking all entities above, in deterministic code-point order.
    unknownNames: [...unknown].sort(),
  };
}
