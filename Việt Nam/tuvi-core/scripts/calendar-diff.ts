import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { calendarDifferences, formatDate, VIETNAMESE_CALENDAR_MODEL, assertYear } from '../src/calendar';

/** Enumerate differences without treating the astronomical model as historical official-calendar truth. */
export function buildCalendarDiff(fromYear: number, toYear: number) {
  assertYear(fromYear);
  assertYear(toYear);
  if (fromYear > toYear) throw new RangeError('fromYear must be <= toYear');
  const years = [];
  for (let year = fromYear; year <= toYear; year++) {
    const differences = calendarDifferences(year);
    years.push({
      year,
      comparedDays: (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000,
      differentDays: differences.length,
      differences: differences.map(item => ({
        date: formatDate(item.solar),
        chinese: item.chinese,
        vietnamese: item.vietnamese,
      })),
    });
  }
  return {
    schemaVersion: 'calendar-difference.v1',
    model: VIETNAMESE_CALENDAR_MODEL,
    chineseCalendar: 'lunar-javascript@1.7.7, as used by the vendored upstream engine',
    range: { fromYear, toYear },
    summary: {
      comparedDays: years.reduce((sum, year) => sum + year.comparedDays, 0),
      differentDays: years.reduce((sum, year) => sum + year.differentDays, 0),
    },
    years,
    limitation: 'Differences are a calendar-convention warning. They do not establish which convention a school or historical civil record intended.',
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--from', '--to', '--output'].includes(args[i]) || !args[i + 1]) {
      throw new TypeError('Usage: calendar-diff --from 1990 --to 1990 [--output reports/calendar-diff-1990.json]');
    }
    if (values.has(args[i])) throw new TypeError(`Duplicate option ${args[i]}`);
    values.set(args[i], args[i + 1]);
  }
  const fromYear = Number(values.get('--from') ?? '1990');
  const toYear = Number(values.get('--to') ?? String(fromYear));
  const report = buildCalendarDiff(fromYear, toYear);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const output = values.get('--output');
  if (output) {
    mkdirSync(dirname(resolve(output)), { recursive: true });
    writeFileSync(output, json, 'utf8');
  } else process.stdout.write(json);
}

if (require.main === module) {
  try { main(); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
