'use strict';

const { INTERPRETATION_SCHEMA_VERSION } = require('../schema');

const MAJOR_STAR_IDS = new Set([
  'STAR.ZIWEI', 'STAR.TIANJI', 'STAR.TAIYANG', 'STAR.WUQU', 'STAR.TIANTONG',
  'STAR.LIANZHEN', 'STAR.TIANFU', 'STAR.TAIYIN', 'STAR.TANLANG', 'STAR.JUMEN',
  'STAR.TIANXIANG', 'STAR.TIANLIANG', 'STAR.QISHA', 'STAR.POJUN',
]);

/**
 * Picks up to `limit` retrieved quote IDs whose text/tags match any of the given keywords.
 * @param {any[]} quotes
 * @param {string[]} keywords
 * @param {number} [limit]
 * @returns {string[]}
 */
function pickQuotes(quotes, keywords, limit = 2) {
  if (!Array.isArray(quotes) || quotes.length === 0) return [];
  const lowerKeys = keywords.filter(Boolean).map(k => k.normalize('NFC').toLowerCase());
  const matched = quotes.filter(q => {
    const hay = `${q.tags || ''} ${q.section || ''} ${q.text || ''}`.normalize('NFC').toLowerCase();
    return lowerKeys.some(k => hay.includes(k));
  });
  return matched.slice(0, limit).map(q => q.id);
}

/**
 * Converts a `@tuvi/core` fact record into a clean structured assertion tuple.
 * @param {any} fact
 */
function toAssertion(fact) {
  return {
    subjectId: fact.subjectId,
    predicate: fact.predicate,
    ...(fact.objectId !== undefined ? { objectId: fact.objectId } : {}),
    ...(fact.value !== undefined ? { value: fact.value } : {}),
  };
}

/**
 * Deterministic structural baseline adapter (non-LLM).
 * Explicitly formats structural chart records from `@tuvi/core` facts and attaches
 * matching corpus quotes for pipeline verification — NEVER impersonates human/AI commentary.
 */
function createMockAdapter() {
  return {
    id: 'mock-structural-baseline-v0',
    kind: /** @type {const} */ ('mock'),
    /**
     * @param {{ context: any }} input
     */
    async generate({ context }) {
      const { chartSummary, palaces, facts, retrievedQuotes, focusPalaceId, profile } = context;
      const findFacts = predicate => facts.filter(predicate);

      const mingPalace = palaces.find(p => p.isMing);
      const mingFact = findFacts(f => f.subjectId === 'CHART.MING' && f.predicate === 'LOCATED_AT_BRANCH')[0];
      const shenFact = findFacts(f => f.subjectId === 'CHART.SHEN' && f.predicate === 'LOCATED_IN')[0];
      const juFact = findFacts(f => f.predicate === 'HAS_FIVE_ELEMENTS_CLASS')[0];

      /** @type {any[]} */
      const claims = [];
      let claimSeq = 1;
      const nextId = () => `CLAIM.${claimSeq++}`;

      // 1. Bản ghi cấu trúc cung Mệnh
      if (mingPalace && mingFact) {
        if (chartSummary.mingIsEmpty) {
          const emptyFacts = findFacts(
            f => f.subjectId === mingPalace.id && (f.predicate === 'HAS_NO_MAJOR_STAR' || f.predicate === 'BORROWS_OPPOSITE_MAJOR_STAR'),
          );
          const selected = [mingFact, ...emptyFacts];
          const borrowedText = chartSummary.mingBorrowedStars.length > 0
            ? `; mượn chính tinh đối cung: ${chartSummary.mingBorrowedStars.join(', ')}`
            : '';
          claims.push({
            id: nextId(),
            category: 'menh-than',
            statement: `[Bản ghi cấu trúc] Cung Mệnh tại ${chartSummary.mingBranchLabelVi}, trạng thái Mệnh vô chính diệu${borrowedText}.`,
            assertions: selected.map(toAssertion),
            factIds: selected.map(f => f.id),
            quoteIds: pickQuotes(retrievedQuotes, ['vô chính diệu', ...chartSummary.mingBorrowedStars], 2),
            confidence: 'high',
          });
        } else {
          const mingMajorFacts = findFacts(
            f => f.objectId === mingPalace.id
              && f.predicate === 'LOCATED_IN'
              && MAJOR_STAR_IDS.has(f.subjectId),
          );
          const selected = [mingFact, ...mingMajorFacts];
          const starDesc = mingPalace.majorStars
            .map(s => `${s.nameVi}${s.brightnessVi ? ` (${s.brightnessVi})` : ''}`)
            .join(', ');
          claims.push({
            id: nextId(),
            category: 'menh-than',
            statement: `[Bản ghi cấu trúc] Cung Mệnh tại ${chartSummary.mingBranchLabelVi}; chính tinh tọa thủ Mệnh: ${starDesc}.`,
            assertions: selected.map(toAssertion),
            factIds: selected.map(f => f.id),
            quoteIds: pickQuotes(retrievedQuotes, chartSummary.mingMajorStars, 2),
            confidence: 'high',
          });
        }
      }

      // 2. Bản ghi cung Thân
      if (shenFact && chartSummary.shenPalaceLabelVi) {
        claims.push({
          id: nextId(),
          category: 'menh-than',
          statement: `[Bản ghi cấu trúc] Cung Thân cư tại cung ${chartSummary.shenPalaceLabelVi}.`,
          assertions: [toAssertion(shenFact)],
          factIds: [shenFact.id],
          quoteIds: pickQuotes(retrievedQuotes, [`thân cư ${chartSummary.shenPalaceLabelVi}`, chartSummary.shenPalaceLabelVi], 1),
          confidence: 'high',
        });
      }

      // 3. Bản ghi Ngũ Hành Cục
      if (juFact && chartSummary.wuxingJuLabelVi) {
        claims.push({
          id: nextId(),
          category: 'ngu-hanh-cuc',
          statement: `[Bản ghi cấu trúc] Ngũ hành cục: ${chartSummary.wuxingJuLabelVi} (${chartSummary.yinYangGender}).`,
          assertions: [toAssertion(juFact)],
          factIds: [juFact.id],
          quoteIds: pickQuotes(retrievedQuotes, [chartSummary.wuxingJuLabelVi, 'cục'], 1),
          confidence: 'high',
        });
      }

      // 4. Bản ghi Tứ Hóa bản mệnh
      if (chartSummary.siHua.length > 0) {
        const siHuaFacts = chartSummary.siHua
          .map(item => facts.find(f => f.id === item.factId))
          .filter(Boolean);
        if (siHuaFacts.length > 0) {
          const siHuaText = chartSummary.siHua
            .map(item => `${item.starNameVi} ${item.transformation} tại cung ${item.palaceNameVi}`)
            .join('; ');
          claims.push({
            id: nextId(),
            category: 'tu-hoa',
            statement: `[Bản ghi cấu trúc] Tứ Hóa bản mệnh gồm: ${siHuaText}.`,
            assertions: siHuaFacts.map(toAssertion),
            factIds: siHuaFacts.map(f => f.id),
            quoteIds: pickQuotes(
              retrievedQuotes,
              ['tứ hóa', 'hóa kỵ', 'hóa lộc', ...chartSummary.siHua.map(s => s.starNameVi)],
              2,
            ),
            confidence: 'high',
          });
        }
      }

      // 5. Bản ghi Tam phương tứ chính của cung đang xét
      const targetPalaceId = focusPalaceId || chartSummary.mingPalaceId || 'PALACE.MING';
      const targetPalace = palaces.find(p => p.id === targetPalaceId) || mingPalace;
      if (targetPalace) {
        const oppFact = facts.find(f => f.subjectId === targetPalace.id && f.predicate === 'OPPOSITE_TO');
        const trineFacts = facts.filter(f => f.subjectId === targetPalace.id && f.predicate === 'TRINE_WITH');
        const relFacts = [oppFact, ...trineFacts].filter(Boolean);
        if (relFacts.length > 0) {
          const palaceById = new Map(palaces.map(p => [p.id, p]));
          const oppName = oppFact ? (palaceById.get(oppFact.objectId)?.nameVi || oppFact.objectId) : '';
          const trineNames = trineFacts.map(f => palaceById.get(f.objectId)?.nameVi || f.objectId);
          claims.push({
            id: nextId(),
            category: 'tam-phuong',
            statement: `[Bản ghi cấu trúc] Quan hệ cung của ${targetPalace.nameVi}: đối cung ${oppName}; tam hợp ${trineNames.join(', ')}.`,
            assertions: relFacts.map(toAssertion),
            factIds: relFacts.map(f => f.id),
            quoteIds: pickQuotes(retrievedQuotes, [targetPalace.nameVi, oppName, 'tam phương'], 1),
            confidence: 'high',
          });
        }
      }

      // 6. Bản ghi 3 đại hạn đầu
      const daXianFacts = facts
        .filter(f => f.predicate === 'HAS_DECADAL_AGE_RANGE' && Array.isArray(f.value))
        .sort((a, b) => a.value[0] - b.value[0])
        .slice(0, 3);
      if (daXianFacts.length > 0) {
        const palaceById = new Map(palaces.map(p => [p.id, p]));
        const rangesText = daXianFacts.map(f => {
          const pName = palaceById.get(f.subjectId)?.nameVi || f.subjectId;
          return `${f.value[0]}–${f.value[1]} tuổi (${pName})`;
        }).join(' → ');
        claims.push({
          id: nextId(),
          category: 'dai-han',
          statement: `[Bản ghi cấu trúc] Ba đại hạn đầu tiên: ${rangesText}.`,
          assertions: daXianFacts.map(toAssertion),
          factIds: daXianFacts.map(f => f.id),
          quoteIds: pickQuotes(retrievedQuotes, ['đại hạn', 'lưu niên'], 1),
          confidence: 'medium',
        });
      }

      const mingLabel = chartSummary.mingIsEmpty
        ? `Mệnh vô chính diệu tại ${chartSummary.mingBranchLabelVi}`
        : `Mệnh tại ${chartSummary.mingBranchLabelVi} (${chartSummary.mingMajorStars.join(', ')})`;

      const response = {
        schemaVersion: INTERPRETATION_SCHEMA_VERSION,
        summary: `[Chế độ đối chứng kỹ thuật · Không dùng LLM] Tóm tắt dữ kiện cấu trúc từ @tuvi/core (profile '${profile.id}', trạng thái '${profile.status}'): ${mingLabel}, Thân cư ${chartSummary.shenPalaceLabelVi}, ${chartSummary.wuxingJuLabelVi}.`,
        reasoningSteps: [
          `Trích xuất trực tiếp dữ kiện Mệnh/Thân (${mingLabel}, Thân cư ${chartSummary.shenPalaceLabelVi}).`,
          `Trích xuất Ngũ Hành Cục (${chartSummary.wuxingJuLabelVi}) và 4 biến hóa Tứ Hóa bản mệnh.`,
          `Đối chiếu quan hệ đối cung & tam hợp của cung trọng tâm (${targetPalace?.nameVi || 'Mệnh'}).`,
          `Ghép ${retrievedQuotes.length} câu trích dẫn nguyên văn từ kho 1.848 câu bài giảng theo từ khóa sao/cung.`,
        ],
        claims,
        actionGuidance: [
          'Chế độ Mock chỉ xuất bản kê dữ kiện cấu trúc và trích dẫn khớp từ khóa để kiểm thử kỹ thuật; muốn sinh văn bản phân tích tự động cần kết nối LLM cục bộ (localhost).',
          'Không áp dụng các hình thức cúng sao giải hạn hay bùa chú; đối chiếu thực tế hoàn cảnh và hành động cụ thể.',
        ],
        disclaimer: `Bản ghi sinh bởi bộ tổng hợp đối chứng kỹ thuật (mock, không suy luận AI). Profile '${profile.id}' đang ở trạng thái '${profile.status}' (bảng sáng '${profile.brightnessSchool}').`,
      };

      return {
        response,
        rawOutput: JSON.stringify(response, null, 2),
      };
    },
  };
}

module.exports = {
  createMockAdapter,
};
