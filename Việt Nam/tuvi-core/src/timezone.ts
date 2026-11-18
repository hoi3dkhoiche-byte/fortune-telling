import type { CivilDate } from './calendar';

export interface LocalClock extends CivilDate { hour: number; minute: number; second?: number }
export interface TimeZoneCandidate { instant: string; utcOffsetMinutes: number }
export interface LocalTimeResolution {
  timeZone: string;
  canonicalTimeZone: string;
  status: 'unique' | 'ambiguous' | 'nonexistent';
  candidates: TimeZoneCandidate[];
  database: { icu: string; tz: string | null };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timeZone);
  if (existing) return existing;
  if (typeof timeZone !== 'string' || !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+)$/.test(timeZone)) {
    throw new TypeError('tz must be an IANA zone such as Asia/Ho_Chi_Minh or UTC.');
  }
  const result = new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  formatters.set(timeZone, result);
  return result;
}

export function validateTimeZone(timeZone: string): void { formatter(timeZone); }

function localParts(instantMs: number, fmt: Intl.DateTimeFormat): Required<LocalClock> {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(instantMs)).map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}

function offsetMsAt(instantMs: number, fmt: Intl.DateTimeFormat): number {
  const local = localParts(instantMs, fmt);
  return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - Math.floor(instantMs / 1000) * 1000;
}

/** Uses Node's bundled ICU/IANA tzdata and retains historical second offsets. */
export function resolveLocalTime(clock: LocalClock, timeZone: string): LocalTimeResolution {
  const fmt = formatter(timeZone);
  const probe = new Date(Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second ?? 0));
  if (!Number.isInteger(clock.year) || !Number.isInteger(clock.month) || !Number.isInteger(clock.day) || !Number.isInteger(clock.hour) || !Number.isInteger(clock.minute) || !Number.isInteger(clock.second ?? 0)
    || probe.getUTCFullYear() !== clock.year || probe.getUTCMonth() + 1 !== clock.month || probe.getUTCDate() !== clock.day
    || clock.hour < 0 || clock.hour > 23 || clock.minute < 0 || clock.minute > 59 || (clock.second ?? 0) < 0 || (clock.second ?? 0) > 59) {
    throw new RangeError('Invalid local civil clock.');
  }
  const naiveMs = probe.getTime();
  const offsets = new Set<number>();
  // Both sides of transitions, including 24h international-date-line skips.
  for (const hours of [-48, -24, -12, -6, 0, 6, 12, 24, 48]) offsets.add(offsetMsAt(naiveMs + hours * 3_600_000, fmt));
  for (const offset of [...offsets]) offsets.add(offsetMsAt(naiveMs - offset, fmt));
  const candidates: TimeZoneCandidate[] = [];
  for (const offset of offsets) {
    const instantMs = naiveMs - offset;
    const actual = localParts(instantMs, fmt);
    if (actual.year === clock.year && actual.month === clock.month && actual.day === clock.day && actual.hour === clock.hour && actual.minute === clock.minute && actual.second === (clock.second ?? 0)) {
      candidates.push({ instant: new Date(instantMs).toISOString(), utcOffsetMinutes: offset / 60_000 });
    }
  }
  candidates.sort((a, b) => a.instant.localeCompare(b.instant));
  return {
    timeZone, canonicalTimeZone: fmt.resolvedOptions().timeZone,
    status: candidates.length === 0 ? 'nonexistent' : candidates.length === 1 ? 'unique' : 'ambiguous', candidates,
    database: { icu: process.versions.icu ?? 'unknown', tz: process.versions.tz ?? null },
  };
}
