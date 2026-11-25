'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DOCS_DIR = path.resolve(__dirname, '../../docs tiếng việt');
const QUOTE_LINE_RE = /^- \[(\d{2}:\d{2}:\d{2})\]\((https?:\/\/[^)]+)\)\s+「([\s\S]*?)」(.*?)(?:\s*<sub>(.*?)<\/sub>)?$/;
const SECTION_RE = /^##\s+(.+)$/;

const STOPWORDS = new Set([
  'của', 'và', 'là', 'có', 'cho', 'trong', 'này', 'đó', 'mà', 'thì', 'với',
  'khi', 'như', 'nếu', 'được', 'không', 'một', 'các', 'những', 'người', 'ta',
  'quý', 'vị', 'chư', 'tôi', 'nó', 'lại', 'ra', 'vào', 'đến', 'từ', 'về',
  'ở', 'cũng', 'rất', 'nhiều', 'phải', 'nên', 'vì', 'bởi', 'hay', 'hoặc',
  'đều', 'sẽ', 'đã', 'đang', 'nào', 'gì', 'sao', 'cung',
]);

/**
 * Strips Vietnamese diacritics for fuzzy matching while preserving base words.
 * @param {string} text
 * @returns {string}
 */
function foldVietnamese(text) {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Tokenizes Vietnamese text into lowercase unigrams + bigrams (important for compound star names like "thiên lương", "hóa kỵ").
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
  const tokens = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]} ${words[i + 1]}`);
  }
  return tokens;
}

/**
 * Derives a compact, deterministic lecture code from filename.
 * e.g. `Bài 04 Thượng.md` -> `04T`, `Bài 24 Hạ_Bổ sung 2.md` -> `24H`
 * @param {string} filename
 * @returns {string}
 */
function lectureCode(filename) {
  const num = /(\d{2})/.exec(filename)?.[1] ?? '00';
  const half = /Hạ/i.test(filename) ? 'H' : 'T';
  return `${num}${half}`;
}

/** @type {Map<string, ReturnType<typeof buildCorpusIndex>>} */
const corpusCache = new Map();

/**
 * Parses all 16 Thiên Kỷ lecture markdown files and builds a BM25 + tag-boosted index.
 * @param {string} docsDir
 */
function buildCorpusIndex(docsDir) {
  if (!fs.existsSync(docsDir)) {
    throw new Error(`Không tìm thấy thư mục ngữ liệu bài giảng: ${docsDir}`);
  }
  const files = fs
    .readdirSync(docsDir)
    .filter(name => name.startsWith('Bài ') && name.endsWith('.md'))
    .sort();

  /** @type {Array<any>} */
  const quotes = [];
  /** @type {Map<string, any>} */
  const byId = new Map();
  /** @type {Map<string, number>} */
  const docFreq = new Map();
  let totalDocLen = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(docsDir, file), 'utf8');
    const lines = raw.split(/\r?\n/);
    const code = lectureCode(file);
    let lectureTitle = file.replace(/\.md$/, '');
    let section = '';
    let idx = 0;

    for (const line of lines) {
      if (line.startsWith('# ')) {
        lectureTitle = line.slice(2).trim();
        continue;
      }
      const secMatch = SECTION_RE.exec(line);
      if (secMatch) {
        section = secMatch[1].trim();
        continue;
      }
      if (!line.startsWith('- [')) continue;
      const match = QUOTE_LINE_RE.exec(line);
      if (!match) continue;
      idx++;
      const [, timestamp, url, text, middle, tagsRaw] = match;
      const editorialNote = (middle || '').trim();
      const tags = (tagsRaw || '').trim();
      const id = `TK.${code}.${String(idx).padStart(3, '0')}`;

      const bodyTokens = tokenize(text);
      const tagTokens = tokenize(`${section} ${tags}`);
      const foldedBody = foldVietnamese(text);
      const foldedTags = foldVietnamese(`${section} ${tags}`);

      /** @type {Map<string, number>} */
      const tf = new Map();
      for (const t of bodyTokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      // Tag and section terms carry extra weight because they are curated doctrinal labels.
      for (const t of tagTokens) tf.set(t, (tf.get(t) ?? 0) + 2.5);

      const docLen = bodyTokens.length + tagTokens.length * 2.5;
      totalDocLen += docLen;
      for (const term of tf.keys()) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
      }

      const record = {
        id,
        sourceFile: file,
        lectureTitle,
        section,
        timestamp,
        url,
        text: text.trim(),
        editorialNote,
        tags,
        _tf: tf,
        _docLen: docLen,
        _foldedBody: foldedBody,
        _foldedTags: foldedTags,
      };
      quotes.push(record);
      byId.set(id, record);
    }
  }

  const N = Math.max(1, quotes.length);
  const avgDocLen = totalDocLen / N;
  const k1 = 1.4;
  const b = 0.65;

  /**
   * Builds search phrases and query tokens from an anonymized chart context and optional question.
   * @param {{ context?: any, question?: string, focusPalace?: string }} query
   */
  function extractQuerySignals(query) {
    /** @type {Array<{ phrase: string, weight: number }>} */
    const phrases = [];
    const ctx = query.context;

    if (ctx?.chartSummary) {
      const s = ctx.chartSummary;
      for (const star of s.mingMajorStars || []) {
        phrases.push({ phrase: star, weight: 3.5 });
      }
      if (s.mingIsEmpty) {
        phrases.push({ phrase: 'vô chính diệu', weight: 4.0 });
        for (const borrowed of s.mingBorrowedStars || []) {
          phrases.push({ phrase: borrowed, weight: 2.5 });
        }
      }
      if (s.shenPalaceLabelVi) {
        phrases.push({ phrase: `thân cư ${s.shenPalaceLabelVi}`, weight: 2.2 });
      }
      for (const sh of s.siHua || []) {
        phrases.push({ phrase: sh.transformation, weight: 1.8 });
        phrases.push({ phrase: `${sh.starNameVi} ${sh.transformation}`, weight: 3.2 });
      }
      // Detect iconic Thiên Kỷ star clusters in Mệnh or Tam phương
      const mingSet = new Set([...(s.mingMajorStars || []), ...(s.mingBorrowedStars || [])]);
      if (mingSet.has('Thất Sát') || mingSet.has('Phá Quân') || mingSet.has('Tham Lang')) {
        phrases.push({ phrase: 'sát phá tham', weight: 2.8 });
      }
      if (mingSet.has('Thiên Cơ') || mingSet.has('Thiên Lương') || mingSet.has('Thái Âm') || mingSet.has('Thiên Đồng')) {
        phrases.push({ phrase: 'cơ nguyệt đồng lương', weight: 2.4 });
      }
      // Check Lộc phùng Kỵ / Khoa phùng Kỵ in the same palace
      const siHuaByPalace = new Map();
      for (const sh of s.siHua || []) {
        if (!siHuaByPalace.has(sh.palaceNameVi)) siHuaByPalace.set(sh.palaceNameVi, new Set());
        siHuaByPalace.get(sh.palaceNameVi).add(sh.transformation);
      }
      for (const set of siHuaByPalace.values()) {
        if (set.has('Hóa Lộc') && set.has('Hóa Kỵ')) phrases.push({ phrase: 'lộc phùng kỵ', weight: 4.0 });
        if (set.has('Hóa Khoa') && set.has('Hóa Kỵ')) phrases.push({ phrase: 'khoa phùng kỵ', weight: 4.0 });
      }
    }

    if (query.focusPalace && ctx?.palaces) {
      const target = ctx.palaces.find(
        p => p.id === query.focusPalace || p.nameVi.toLowerCase() === String(query.focusPalace).toLowerCase(),
      );
      if (target) {
        phrases.push({ phrase: target.nameVi, weight: 3.0 });
        for (const star of target.majorStars || []) {
          phrases.push({ phrase: star.nameVi, weight: 3.5 });
        }
      }
    } else if (query.focusPalace) {
      phrases.push({ phrase: String(query.focusPalace), weight: 3.0 });
    }

    if (query.question) {
      phrases.push({ phrase: query.question, weight: 3.0 });
    }

    // Build weighted token map
    /** @type {Map<string, number>} */
    const tokenWeights = new Map();
    for (const { phrase, weight } of phrases) {
      for (const t of tokenize(phrase)) {
        tokenWeights.set(t, Math.max(tokenWeights.get(t) ?? 0, weight));
      }
    }
    return { phrases, tokenWeights };
  }

  /**
   * @param {{ context?: any, question?: string, focusPalace?: string, topK?: number }} query
   */
  function retrieve(query = {}) {
    const topK = Math.max(1, Math.min(20, Number(query.topK) || 8));
    const { phrases, tokenWeights } = extractQuerySignals(query);
    if (tokenWeights.size === 0 && phrases.length === 0) return [];

    /** @type {Array<{ record: any, score: number, matchedTerms: Set<string> }>} */
    const scored = [];
    const foldedPhrases = phrases.map(p => ({
      raw: p.phrase,
      folded: foldVietnamese(p.phrase).trim(),
      weight: p.weight,
    })).filter(p => p.folded.length >= 3);

    for (const record of quotes) {
      let score = 0;
      /** @type {Set<string>} */
      const matchedTerms = new Set();

      for (const [term, qWeight] of tokenWeights) {
        const tf = record._tf.get(term);
        if (!tf) continue;
        const df = docFreq.get(term) ?? 1;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const bm25 = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * record._docLen) / avgDocLen)));
        score += bm25 * qWeight;
        matchedTerms.add(term);
      }

      // Exact phrase boost in curated tags or quote text
      for (const fp of foldedPhrases) {
        if (record._foldedTags.includes(fp.folded)) {
          score += 5.0 * fp.weight;
          matchedTerms.add(fp.raw);
        } else if (record._foldedBody.includes(fp.folded)) {
          score += 2.0 * fp.weight;
          matchedTerms.add(fp.raw);
        }
      }

      if (score > 0) scored.push({ record, score, matchedTerms });
    }

    scored.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));

    // Deduplicate entries that share the same sourceFile + timestamp (multi-tagged duplicates in source markdown)
    const seenTimestamps = new Set();
    const results = [];
    for (const item of scored) {
      const dedupeKey = `${item.record.sourceFile}@${item.record.timestamp}`;
      if (seenTimestamps.has(dedupeKey)) continue;
      seenTimestamps.add(dedupeKey);
      results.push({
        id: item.record.id,
        sourceFile: item.record.sourceFile,
        lectureTitle: item.record.lectureTitle,
        section: item.record.section,
        timestamp: item.record.timestamp,
        url: item.record.url,
        text: item.record.text,
        editorialNote: item.record.editorialNote,
        tags: item.record.tags,
        score: Math.round(item.score * 100) / 100,
        matchedTerms: [...item.matchedTerms].slice(0, 6),
      });
      if (results.length >= topK) break;
    }

    return results;
  }

  /**
   * Public clean view of quotes without private indexing fields.
   */
  const publicQuotes = quotes.map(({ _tf, _docLen, _foldedBody, _foldedTags, ...pub }) => pub);
  /** @type {Map<string, any>} */
  const publicById = new Map(publicQuotes.map(q => [q.id, q]));

  return {
    quotes: publicQuotes,
    lectureCount: files.length,
    retrieve,
    getById: id => publicById.get(id),
  };
}

/**
 * Loads (and caches) the 1,848-quote Thiên Kỷ Vietnamese lecture corpus.
 * @param {string} [docsDir]
 */
function loadCorpus(docsDir = DEFAULT_DOCS_DIR) {
  const resolved = path.resolve(docsDir);
  if (!corpusCache.has(resolved)) {
    corpusCache.set(resolved, buildCorpusIndex(resolved));
  }
  return /** @type {ReturnType<typeof buildCorpusIndex>} */ (corpusCache.get(resolved));
}

module.exports = {
  DEFAULT_DOCS_DIR,
  loadCorpus,
  foldVietnamese,
  tokenize,
};
