import test from 'node:test';
import assert from 'node:assert/strict';
import {
  solarToVietnamese, vietnameseToSolar, solarToChinese, chineseToSolar,
  compareCalendars, parseDate, formatDate, calendarDifferences,
} from '../src/calendar';

test('Vietnamese New Year independently published as 29 January 2025', () => {
  // Primary source: https://baochinhphu.vn/mung-1-tet-nguyen-dan-at-ty-tai-nan-giao-thong-giam-o-ca-3-tieu-chi-102250129175001894.htm
  const solar = { year: 2025, month: 1, day: 29 };
  const lunar = { year: 2025, month: 1, day: 1, isLeap: false };
  assert.deepEqual(solarToVietnamese(solar), lunar);
  assert.deepEqual(vietnameseToSolar(lunar), solar);
});

test('2033 leap-eleventh-month case does not mistake an earlier termless month for leap', () => {
  // HKO 2033 conversion table: https://www.hko.gov.hk/en/gts/time/calendar/pdf/files/2033e.pdf
  // Both UTC+7 model and upstream Chinese calendar agree on these particular days.
  assert.deepEqual(solarToVietnamese({ year: 2033, month: 8, day: 25 }), { year: 2033, month: 8, day: 1, isLeap: false });
  assert.deepEqual(solarToVietnamese({ year: 2033, month: 12, day: 22 }), { year: 2033, month: 11, day: 1, isLeap: true });
});

test('Vietnamese/Chinese differences retain both dates rather than changing source data', () => {
  const result = compareCalendars({ year: 1968, month: 1, day: 29 });
  assert.equal(result.different, true);
  assert.deepEqual(result.chinese, { year: 1967, month: 12, day: 30, isLeap: false });
  assert.deepEqual(result.vietnamese, { year: 1968, month: 1, day: 1, isLeap: false });
  assert.equal(result.model, 'astronomy-engine-fixed-UTC+7');
});

test('astronomical lunar round trips cover 1900–2050 including all months and leap candidates', () => {
  for (let year = 1900; year <= 2050; year += 5) {
    for (let month = 1; month <= 12; month++) {
      const date = { year, month, day: month % 2 ? 1 : 28 };
      const lunar = solarToVietnamese(date);
      // Lunar dates in the last part of 1899 are deliberately outside accepted lunar-input years.
      if (lunar.year >= 1900) assert.equal(formatDate(vietnameseToSolar(lunar)), formatDate(date));
    }
  }
});

test('China conversion distinguishes leap-month identity and rejects nonexistent dates', () => {
  const leap = { year: 1990, month: 5, day: 1, isLeap: true };
  const regular = { ...leap, isLeap: false };
  assert.deepEqual(chineseToSolar(leap), { year: 1990, month: 6, day: 23 });
  assert.notEqual(formatDate(chineseToSolar(leap)), formatDate(chineseToSolar(regular)));
  assert.deepEqual(solarToChinese(chineseToSolar(leap)), leap);
  assert.throws(() => chineseToSolar({ year: 1990, month: 4, day: 1, isLeap: true }));
  assert.throws(() => vietnameseToSolar({ year: 1990, month: 4, day: 1, isLeap: true }));
  assert.throws(() => parseDate('1900-02-29'));
  assert.throws(() => parseDate('2051-01-01'));
});

test('1990 calendar comparison is exhaustive and model-specific', () => {
  assert.deepEqual(calendarDifferences(1990), []);
});
