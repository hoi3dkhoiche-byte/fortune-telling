import { createHash } from 'node:crypto';

/** Object keys are sorted; array order and JSON number/string semantics are preserved. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  function sort(item: unknown, inArray = false): unknown {
    if (item === undefined) return inArray ? null : undefined;
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('Hash không chấp nhận NaN/Infinity.');
      return item;
    }
    if (typeof item !== 'object') throw new TypeError('Hash chỉ chấp nhận dữ liệu JSON.');
    if (ancestors.has(item)) throw new TypeError('Hash không chấp nhận object vòng.');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new TypeError('Hash chỉ chấp nhận object JSON thuần.');
    }
    ancestors.add(item);
    const result = Array.isArray(item) ? item.map(x => sort(x, true))
      : Object.fromEntries(Object.keys(item).sort().filter(key => (item as Record<string, unknown>)[key] !== undefined)
        .map(key => [key, sort((item as Record<string, unknown>)[key])]));
    ancestors.delete(item);
    return result;
  }
  const json = JSON.stringify(sort(value));
  if (json === undefined) throw new TypeError('Hash cần giá trị JSON.');
  return json;
}
export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
