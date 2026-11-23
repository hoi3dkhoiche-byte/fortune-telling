import { getDisplayNatal } from './chart.js';

/** Tóm tắt các nhận định có ID nguồn trong dữ kiện của engine. */
export function buildFactSummary(result) {
  const natal = getDisplayNatal(result);
  if (!natal || !Array.isArray(result?.facts)) return [];
  const palaces = new Map(natal.palaces.map(palace => [palace.id, palace]));
  const ming = natal.palaces.find(palace => palace.branch === natal.mingGongBranch);
  const facts = result.facts;
  const row = (fact, text, predicate) => ({ id: fact.id, text, predicate: predicate || fact.predicate });
  const taiMenh = [];
  const transforms = [];
  const ranges = [];

  for (const fact of facts) {
    switch (fact.predicate) {
      case 'LOCATED_AT_BRANCH':
        if (fact.subjectId === 'CHART.MING' && ming?.branchLabelVi) {
          taiMenh.push(row(fact, `Mệnh tại ${ming.branchLabelVi}`));
        }
        break;
      case 'LOCATED_IN': {
        if (fact.subjectId === 'CHART.SHEN') {
          const palace = palaces.get(fact.objectId);
          if (palace) taiMenh.push(row(fact, `Thân cư ${palace.labelVi || palace.name}`));
        } else if (ming && fact.objectId === ming.id) {
          const star = ming.stars.find(item => item.id === fact.subjectId && item.type === 'major');
          if (star) {
            const hasGrade = facts.some(grade => grade.predicate === 'HAS_BRIGHTNESS_AT_PALACE'
              && grade.subjectId === fact.subjectId && grade.objectId === ming.id && grade.value === star.brightnessRaw);
            const brightness = hasGrade && (star.brightnessLabelVi || star.brightnessRaw);
            taiMenh.push(row(fact, `${star.labelVi || star.name} tọa thủ Mệnh${brightness ? ` · ${brightness}` : ''}`));
          }
        }
        break;
      }
      case 'HAS_NO_MAJOR_STAR':
        if (ming && fact.subjectId === ming.id && fact.value === true) taiMenh.push(row(fact, 'Mệnh vô chính diệu'));
        break;
      case 'BORROWS_OPPOSITE_MAJOR_STAR': {
        if (!ming || fact.subjectId !== ming.id) break;
        const opposite = natal.palaces.find(palace => palace.branch === ming.oppositeBranch);
        const star = opposite?.stars.find(item => item.id === fact.objectId && item.type === 'major');
        if (star) taiMenh.push(row(fact, `Mượn ${star.labelVi || star.name} từ cung ${opposite.labelVi || opposite.name}`));
        break;
      }
      case 'HAS_FIVE_ELEMENTS_CLASS':
        if (natal.wuxingJuLabelVi || natal.wuxingJuName) {
          taiMenh.push(row(fact, natal.wuxingJuLabelVi || natal.wuxingJuName));
        }
        break;
      case 'HAS_NATAL_TRANSFORMATION': {
        // Pointer giữ đúng vị trí ngay cả khi một sao có mặt ở nhiều cung.
        const match = /^\/palaces\/(\d+)\/stars\/(\d+)\/siHua$/.exec(fact.sourcePath);
        const rawPalace = match && result.natal?.palaces[Number(match[1])];
        const rawStar = rawPalace?.stars[Number(match?.[2])];
        const palace = natal.palaces.find(item => item.branch === rawPalace?.branch);
        const star = palace?.stars.find(item => item.id === fact.subjectId && item.name === rawStar?.name && item.siHua === rawStar?.siHua);
        const transformation = star?.siHuaLabelVi || star?.siHua;
        if (star && transformation) {
          const order = { '禄': 0, '权': 1, '科': 2, '忌': 3 };
          transforms.push({ ...row(fact, `${star.labelVi || star.name} · ${transformation} tại ${palace.labelVi || palace.name}`), sortKey: order[star.siHua] ?? 9 });
        }
        break;
      }
      case 'HAS_DECADAL_AGE_RANGE': {
        const palace = palaces.get(fact.subjectId);
        if (palace && Array.isArray(fact.value) && fact.value.length === 2) {
          const [start, end] = fact.value;
          ranges.push({ ...row(fact, `${start}–${end} tuổi · Cung ${palace.labelVi || palace.name}`), start });
        }
        break;
      }
    }
  }

  // Sắp xếp Mệnh/Thân/Cục theo thứ tự cố định
  const taiMenhOrder = {
    LOCATED_AT_BRANCH: 0,   // Mệnh tại ...
    LOCATED_IN: 1,          // Thân cư ... hoặc sao tọa thủ Mệnh
    HAS_FIVE_ELEMENTS_CLASS: 2,  // Cục
    HAS_NO_MAJOR_STAR: 3,  // Mệnh vô chính diệu
    BORROWS_OPPOSITE_MAJOR_STAR: 4,  // Mượn sao
  };
  taiMenh.sort((a, b) => {
    const orderA = taiMenhOrder[a.predicate] ?? 9;
    const orderB = taiMenhOrder[b.predicate] ?? 9;
    return orderA - orderB;
  });

  return [
    { title: 'Mệnh, Thân và Cục', rows: taiMenh },
    { title: 'Tứ hóa bản mệnh', rows: transforms.sort((a, b) => a.sortKey - b.sortKey) },
    { title: 'Khoảng tuổi đại hạn', rows: ranges.sort((a, b) => a.start - b.start) },
  ].filter(group => group.rows.length);
}

export function renderFactSummary(container, result) {
  container.replaceChildren();
  const groups = buildFactSummary(result);
  if (!groups.length) {
    container.textContent = 'Lá số này chưa có dữ kiện cấu trúc để hiển thị.';
    return;
  }

  for (const { title, rows } of groups) {
    const card = document.createElement('section');
    card.className = 'reading-card';
    const heading = document.createElement('h2');
    heading.className = 'reading-card-title';
    heading.textContent = title;
    const list = document.createElement('ul');
    list.className = 'reading-card-body fact-list';
    for (const { id, text } of rows) {
      const item = document.createElement('li');
      item.dataset.factId = id;
      item.textContent = text;
      list.append(item);
    }
    card.append(heading, list);
    container.append(card);
  }
}
