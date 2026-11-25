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
  const lowerKeys = keywords.filter(Boolean).map(k => k.toLowerCase());
  const matched = quotes.filter(q => {
    const hay = `${q.tags || ''} ${q.section || ''} ${q.text || ''}`.toLowerCase();
    return lowerKeys.some(k => hay.includes(k));
  });
  return matched.slice(0, limit).map(q => q.id);
}

/**
 * Deterministic offline mock adapter grounded 100% in `@tuvi/core` facts
 * and retrieved Thiên Kỷ verbatim quotes. Never calls network APIs.
 */
function createMockAdapter() {
  return {
    id: 'mock-thienky-v0',
    kind: /** @type {const} */ ('mock'),
    /**
     * @param {{ context: any }} input
     */
    async generate({ context }) {
      const { chartSummary, palaces, facts, retrievedQuotes, focusPalaceId } = context;
      const factIds = new Set(facts.map(f => f.id));
      const findFactIds = predicate => facts.filter(predicate).map(f => f.id);

      const mingPalace = palaces.find(p => p.isMing);
      const mingFactId = findFactIds(f => f.subjectId === 'CHART.MING' && f.predicate === 'LOCATED_AT_BRANCH')[0];
      const shenFactId = findFactIds(f => f.subjectId === 'CHART.SHEN' && f.predicate === 'LOCATED_IN')[0];
      const juFactId = findFactIds(f => f.predicate === 'HAS_FIVE_ELEMENTS_CLASS')[0];

      /** @type {any[]} */
      const claims = [];
      let claimSeq = 1;
      const nextId = () => `CLAIM.${claimSeq++}`;

      // 1. Mệnh cung & chính tinh (hoặc Vô chính diệu + mượn sao)
      if (mingPalace && mingFactId) {
        if (chartSummary.mingIsEmpty) {
          const emptyFactIds = findFactIds(
            f => f.subjectId === mingPalace.id && (f.predicate === 'HAS_NO_MAJOR_STAR' || f.predicate === 'BORROWS_OPPOSITE_MAJOR_STAR'),
          );
          const borrowedText = chartSummary.mingBorrowedStars.length > 0
            ? `, mượn chính tinh từ đối cung gồm ${chartSummary.mingBorrowedStars.join(', ')}`
            : '';
          claims.push({
            id: nextId(),
            category: 'menh-than',
            statement: `Cung Mệnh lập tại ${chartSummary.mingBranchLabelVi} thuộc thế Mệnh vô chính diệu${borrowedText}. Khi xem cần lấy đối cung Thiên Di và tam hợp làm trục tham chiếu.`,
            factIds: [mingFactId, ...emptyFactIds].filter(id => factIds.has(id)),
            quoteIds: pickQuotes(retrievedQuotes, ['vô chính diệu', ...chartSummary.mingBorrowedStars], 2),
            confidence: 'high',
          });
        } else {
          const mingMajorFactIds = findFactIds(
            f => f.objectId === mingPalace.id
              && f.predicate === 'LOCATED_IN'
              && MAJOR_STAR_IDS.has(f.subjectId),
          );
          const starDesc = mingPalace.majorStars
            .map(s => `${s.nameVi}${s.brightnessVi ? ` (${s.brightnessVi})` : ''}`)
            .join(', ');
          const selectedMingFacts = [mingFactId, ...mingMajorFactIds];
          claims.push({
            id: nextId(),
            category: 'menh-than',
            statement: `Cung Mệnh an tại ${chartSummary.mingBranchLabelVi}, có chính tinh ${starDesc} tọa thủ Mệnh.`,
            factIds: [...new Set(selectedMingFacts)],
            quoteIds: pickQuotes(retrievedQuotes, chartSummary.mingMajorStars, 2),
            confidence: 'high',
          });
        }
      }

      // 2. Thân cung
      if (shenFactId && chartSummary.shenPalaceLabelVi) {
        claims.push({
          id: nextId(),
          category: 'menh-than',
          statement: `Cung Thân cư ${chartSummary.shenPalaceLabelVi}, thể hiện trọng tâm hậu vận và môi trường phát triển theo trục ${chartSummary.shenPalaceLabelVi}.`,
          factIds: [shenFactId],
          quoteIds: pickQuotes(retrievedQuotes, [`thân cư ${chartSummary.shenPalaceLabelVi}`, chartSummary.shenPalaceLabelVi], 1),
          confidence: 'high',
        });
      }

      // 3. Ngũ Hành Cục
      if (juFactId && chartSummary.wuxingJuLabelVi) {
        claims.push({
          id: nextId(),
          category: 'ngu-hanh-cuc',
          statement: `Lá số thuộc ${chartSummary.wuxingJuLabelVi} (${chartSummary.yinYangGender}), quy định mốc khởi đại hạn và nhịp vận hành của 12 cung.`,
          factIds: [juFactId],
          quoteIds: pickQuotes(retrievedQuotes, [chartSummary.wuxingJuLabelVi, 'cục'], 1),
          confidence: 'high',
        });
      }

      // 4. Tứ Hóa bản mệnh
      if (chartSummary.siHua.length > 0) {
        const siHuaText = chartSummary.siHua
          .map(item => `${item.starNameVi} ${item.transformation} tại ${item.palaceNameVi}`)
          .join('; ');
        claims.push({
          id: nextId(),
          category: 'tu-hoa',
          statement: `Bộ Tứ Hóa bản mệnh cố định gồm: ${siHuaText}. Theo hệ phái Thiên Kỷ, Tứ Hóa bản mệnh là trục cố định để soi điểm cát lợi và điểm cần đề phòng (Giới).`,
          factIds: chartSummary.siHua.map(item => item.factId).filter(id => factIds.has(id)),
          quoteIds: pickQuotes(
            retrievedQuotes,
            ['tứ hóa', 'hóa kỵ', 'hóa lộc', ...chartSummary.siHua.map(s => s.starNameVi)],
            2,
          ),
          confidence: 'high',
        });
      }

      // 5. Tam phương tứ chính của cung trọng tâm (focusPalaceId hoặc Mệnh)
      const targetPalaceId = focusPalaceId || chartSummary.mingPalaceId || 'PALACE.MING';
      const targetPalace = palaces.find(p => p.id === targetPalaceId) || mingPalace;
      if (targetPalace) {
        const oppFact = facts.find(f => f.subjectId === targetPalace.id && f.predicate === 'OPPOSITE_TO');
        const trineFacts = facts.filter(f => f.subjectId === targetPalace.id && f.predicate === 'TRINE_WITH');
        const relFactIds = [oppFact?.id, ...trineFacts.map(f => f.id)].filter(Boolean);
        if (relFactIds.length > 0) {
          const palaceById = new Map(palaces.map(p => [p.id, p]));
          const oppName = oppFact ? (palaceById.get(oppFact.objectId)?.nameVi || oppFact.objectId) : '';
          const trineNames = trineFacts.map(f => palaceById.get(f.objectId)?.nameVi || f.objectId);
          claims.push({
            id: nextId(),
            category: 'tam-phuong',
            statement: `Cung ${targetPalace.nameVi} hội chiếu trực tiếp với đối cung ${oppName} và tam hợp gồm ${trineNames.join(', ')}. Luận giải phải xét đồng bộ tam phương tứ chính thay vì đọc đơn lẻ một cung.`,
            factIds: relFactIds,
            quoteIds: pickQuotes(retrievedQuotes, [targetPalace.nameVi, oppName, 'tam phương'], 1),
            confidence: 'high',
          });
        }
      }

      // 6. Đại hạn cấu trúc
      const daXianFacts = facts
        .filter(f => f.predicate === 'HAS_DECADAL_AGE_RANGE' && Array.isArray(f.value))
        .sort((a, b) => a.value[0] - b.value[0]);
      if (daXianFacts.length >= 3) {
        const palaceById = new Map(palaces.map(p => [p.id, p]));
        const firstThree = daXianFacts.slice(0, 3).map(f => {
          const pName = palaceById.get(f.subjectId)?.nameVi || f.subjectId;
          return `${f.value[0]}–${f.value[1]} tuổi (${pName})`;
        });
        claims.push({
          id: nextId(),
          category: 'dai-han',
          statement: `Nhịp đại hạn khởi đầu lần lượt qua: ${firstThree.join(' → ')}. Cần đối chiếu riêng đại hạn ứng với năm phân tích cụ thể.`,
          factIds: daXianFacts.slice(0, 3).map(f => f.id),
          quoteIds: pickQuotes(retrievedQuotes, ['đại hạn', 'lưu niên'], 1),
          confidence: 'medium',
        });
      }

      // 7. Định hướng cải vận (Tam Tài Thiên + Địa + Nhân, Dĩ quả quyết hành)
      const anchorFactId = mingFactId || facts[0]?.id;
      if (anchorFactId) {
        const kyEntry = chartSummary.siHua.find(item => item.transformation === 'Hóa Kỵ');
        const kyNote = kyEntry
          ? `Đặc biệt lưu ý chữ 'Giới' (phòng ngừa sớm) ở mảng thuộc cung ${kyEntry.palaceNameVi} nơi ${kyEntry.starNameVi} Hóa Kỵ đóng.`
          : 'Luôn giữ tâm thế chủ động phòng ngừa sớm (Giới chi sơ).';
        claims.push({
          id: nextId(),
          category: 'cai-van',
          statement: `Theo nguyên lý Tam Tài của Thiên Kỷ (Thiên 1/3 + Địa 1/3 + Nhân 1/3 = 1), lá số chỉ là phần Thiên mệnh (1/3). ${kyNote} Chủ động điều chỉnh hành vi, quyết đoán theo kết quả thực tế (Dĩ quả quyết hành) và môi trường sống thay vì tin vào mê tín hay cúng bái.`,
          factIds: kyEntry ? [anchorFactId, kyEntry.factId] : [anchorFactId],
          quoteIds: pickQuotes(retrievedQuotes, ['giới', 'phương pháp luận', 'tổng thể'], 1),
          confidence: 'medium',
        });
      }

      const mingLabel = chartSummary.mingIsEmpty
        ? `Mệnh vô chính diệu tại ${chartSummary.mingBranchLabelVi}`
        : `Mệnh tại ${chartSummary.mingBranchLabelVi} (${chartSummary.mingMajorStars.join(', ')})`;

      const response = {
        schemaVersion: INTERPRETATION_SCHEMA_VERSION,
        summary: `Tổng quan cấu trúc bản mệnh (${context.profile.id}): ${mingLabel}, Thân cư ${chartSummary.shenPalaceLabelVi}, ${chartSummary.wuxingJuLabelVi}. Toàn bộ nhận định được neo trực tiếp vào dữ kiện cấu trúc của engine và trích dẫn bài giảng Thiên Kỷ (chế độ mô phỏng cục bộ).`,
        reasoningSteps: [
          `Bước 1 — Quét Mệnh/Thân: ${mingLabel}; Thân cư ${chartSummary.shenPalaceLabelVi}.`,
          `Bước 2 — Xét Ngũ Hành Cục: ${chartSummary.wuxingJuLabelVi} (${chartSummary.yinYangGender}).`,
          `Bước 3 — Kiểm tra cung Phúc Đức & Tam phương tứ chính hội chiếu.`,
          `Bước 4 — Quét bộ Tứ Hóa bản mệnh cố định (${chartSummary.siHua.map(s => `${s.starNameVi} ${s.transformation}`).join(', ')}).`,
          `Bước 5 — Đối chiếu ${retrievedQuotes.length} trích dẫn nguyên văn từ kho 1.848 câu giảng Thiên Kỷ.`,
          `Bước 6 — Đúc kết theo nguyên tắc Dĩ quả quyết hành và Tam Tài (không mê tín).`,
        ],
        claims,
        actionGuidance: [
          'Ưu tiên kiểm chứng lại giờ sinh và bối cảnh thực tế (Nhân đạo) trước khi đưa ra quyết định lớn.',
          'Tập trung phòng ngừa sớm ở lĩnh vực cung có Hóa Kỵ đóng (Giới chi sơ), tránh chủ quan lúc thuận lợi (Giới chi thịnh).',
          'Không dùng hình thức mê tín hay cúng lễ; cải vận bằng hành vi thực tế, năng lực nghề nghiệp và tối ưu không gian sống.',
        ],
        disclaimer: 'Kết quả sinh bởi adapter mô phỏng cục bộ (mock) phục vụ kiểm chứng kiến trúc gắn factId và trích dẫn Thiên Kỷ; mang tính tham khảo học thuật, không thay thế quyết định y tế, pháp lý hay tài chính.',
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
