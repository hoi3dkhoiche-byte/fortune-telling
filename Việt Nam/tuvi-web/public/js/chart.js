/** Hiển thị lá số và các quan hệ cung do engine trả về. */

import { state } from './state.js';

const BRANCH_NAMES = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const BRIGHTNESS_CLASSES = new Map([
  ['庙', 'b-miao'], ['旺', 'b-wang'], ['得', 'b-de'], ['利', 'b-li'],
  ['平', 'b-ping'], ['地', 'b-ping'], ['不', 'b-xian'], ['闲', 'b-xian'], ['陷', 'b-xian'],
]);
const TRANSFORMATION_MARKS = new Map([
  ['禄', { label: 'Lộc', className: 'sh-lu' }], ['权', { label: 'Quyền', className: 'sh-quan' }],
  ['科', { label: 'Khoa', className: 'sh-ke' }], ['忌', { label: 'Kỵ', className: 'sh-ji' }],
]);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}

export function getStarBrightness(star) {
  return {
    label: star.brightnessLabelVi || star.brightnessRaw || '',
    className: BRIGHTNESS_CLASSES.get(star.brightnessRaw) || (star.brightness === 'dim' ? 'b-xian' : ''),
  };
}

export function getStarTransformation(star) {
  const mark = TRANSFORMATION_MARKS.get(star.siHua);
  const label = star.siHuaLabelVi || (mark && `Hóa ${mark.label}`) || star.siHua || '';
  return { label, shortLabel: mark?.label ?? label, className: mark?.className ?? '' };
}

/** CLI exports already carry the labels needed to build the same display view. */
export function getDisplayNatal(result) {
  if (result?.displayNatal) return result.displayNatal;
  const { natal, labels } = result ?? {};
  if (!Array.isArray(natal?.palaces)) return null;
  if (!Array.isArray(labels?.palaces)) return natal;

  const palaces = new Map(labels.palaces.map(palace => [palace.sourceName, palace]));
  return {
    ...natal,
    wuxingJuLabelVi: labels.wuxingJu?.labelVi,
    mingZhuLabelVi: labels.mingZhu?.labelVi,
    shenZhuLabelVi: labels.shenZhu?.labelVi,
    palaces: natal.palaces.map(palace => {
      const label = palaces.get(palace.name);
      if (!label) return palace;
      const stars = new Map((label.stars ?? []).map(star => [star.sourceName, star]));
      return {
        ...palace, id: label.id, labelVi: label.labelVi,
        stemLabelVi: label.stem?.labelVi, branchLabelVi: label.branch?.labelVi,
        stars: palace.stars.map(star => {
          const starLabel = stars.get(star.name);
          return starLabel ? {
            ...star, id: starLabel.id, labelVi: starLabel.labelVi,
            brightnessLabelVi: starLabel.brightness?.labelVi,
            siHuaLabelVi: starLabel.transformation?.labelVi,
          } : star;
        }),
      };
    }),
  };
}

export function getBorrowedStars(palace, natal, facts) {
  const opposite = natal.palaces.find(entry => entry.branch === palace.borrowedFromBranch);
  const sourceStars = opposite?.stars ?? natal.palaces.flatMap(entry => entry.stars);
  const borrowedNames = new Set(palace.borrowedStars ?? []);
  const borrowedIds = new Set((facts ?? [])
    .filter(fact => fact.predicate === 'BORROWS_OPPOSITE_MAJOR_STAR' && fact.subjectId === palace.id)
    .map(fact => fact.objectId));
  const labels = new Map(sourceStars
    .filter(star => star.type === 'major' && (borrowedNames.has(star.name) || borrowedIds.has(star.id)))
    .map(star => [star.name, star.labelVi || star.name]));
  for (const name of borrowedNames) if (!labels.has(name)) labels.set(name, name);
  return [...labels.values()];
}

function formatDate(date) {
  if (!Number.isInteger(date?.year) || !Number.isInteger(date?.month) || !Number.isInteger(date?.day)) return '';
  return `${date.year}-${String(Math.abs(date.month)).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export function getBirthDates(result) {
  const normalization = result.normalization;
  const audit = normalization?.audit ?? [];
  const auditData = step => audit.find(item => item.step === step)?.data;
  const input = normalization?.input ?? auditData('input');
  const lunarConversion = auditData('lunar-to-solar');
  const comparison = auditData('calendar-comparison');
  const natal = result.natal ?? result.displayNatal;
  const effectiveLunar = natal?.lunarInfo;
  const originalLunar = lunarConversion?.input ?? comparison?.chinese;
  const inputIsLeap = input?.calendar === 'lunar' && (input.isLeap ?? lunarConversion?.input?.isLeap);
  const effectiveLunarDate = formatDate({
    year: effectiveLunar?.lunarYear, month: effectiveLunar?.lunarMonth, day: effectiveLunar?.lunarDay,
  });
  return {
    inputCalendar: input?.calendar,
    inputDate: input?.date ? `${input.date}${inputIsLeap ? ' (Nhuận)' : ''}` : '',
    inputTime: input?.time ?? '',
    civilSolarDate: input?.calendar === 'solar' ? input.date : formatDate(lunarConversion?.solar ?? comparison?.solar),
    originalLunarDate: input?.calendar === 'lunar' && input.date
      ? `${input.date}${inputIsLeap ? ' (Nhuận)' : ''}`
      : originalLunar && `${formatDate(originalLunar)}${originalLunar.isLeap ? ' (Nhuận)' : ''}`,
    effectiveSolarDate: formatDate(normalization?.chart ?? natal?.birthInfo),
    effectiveLunarDate: effectiveLunarDate && `${effectiveLunarDate}${effectiveLunar.isLeapMonth ? ' (Nhuận)' : ''}`,
    hourBranch: normalization?.chart?.hourBranch ?? natal?.birthInfo?.hour,
  };
}

// Danh sách sát tinh, bại tinh, hung tinh theo truyền thống Tử Vi Việt Nam
const BAD_STAR_NAMES = new Set([
  'Kình Dương', 'Đà La', 'Hỏa Tinh', 'Linh Tinh', 'Địa Không', 'Địa Kiếp',
  'Thiên Khốc', 'Thiên Hư', 'Tang Môn', 'Bạch Hổ', 'Điếu Khách', 'Quan Phù',
  'Kiếp Sát', 'Thiên Diêu', 'Thiên Hình', 'Đại Hao', 'Tiểu Hao', 'Cô Thần',
  'Quả Tú', 'Bệnh Phù', 'Tử Phù', 'Phá Toái', 'Thiên Thương', 'Thiên Sứ',
  'Tuế Phá', 'Phi Liêm', 'Phục Binh', 'Hóa Kỵ',
  '擎羊', '陀罗', '火星', '铃星', '地空', '地劫', '天哭', '天虚', '丧门', '白虎',
  '吊客', '官符', '劫煞', '天姚', '天刑', '大耗', '小耗', '孤辰', '寡宿', '病符', '死符', '化忌'
]);

export function partitionStars(stars) {
  const leftStars = [];
  const rightStars = [];

  stars.forEach(star => {
    const usesRightColumn = star.type === 'sha'
      || BAD_STAR_NAMES.has(star.name) || BAD_STAR_NAMES.has(star.labelVi)
      || star.siHua === '忌' || star.siHuaLabelVi === 'Hóa Kỵ'
      || star.brightness === 'dim' || BRIGHTNESS_CLASSES.get(star.brightnessRaw) === 'b-xian';
    (usesRightColumn ? rightStars : leftStars).push(star);
  });

  return { leftStars, rightStars };
}

export function setupChart() {
  const boardContainer = document.getElementById('board-container');
  const chartGrid = document.getElementById('chart-grid');
  const svgOverlay = document.getElementById('relations-svg');
  const centerCell = document.getElementById('center-cell');
  const mobileCardList = document.getElementById('mobile-card-list');

  // Gắn sự kiện click cho 12 ô cung
  chartGrid.querySelectorAll('.palace-cell').forEach(cell => {
    const branch = Number(cell.dataset.branch);
    cell.addEventListener('click', () => {
      state.selectPalace(branch);
    });
    cell.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        state.selectPalace(branch);
      }
    });
  });

  state.subscribe(s => {
    renderChart(s);
  });

  window.addEventListener('resize', () => {
    const s = state.getState();
    if (s.currentNatal && s.showRelationLines) {
      drawRelationLines(s);
    }
  });

  function renderChart(s) {
    const { currentNatal, selectedBranch, showRelationLines, viewMode, isSample, userName } = s;

    if (viewMode === 'list') {
      boardContainer.classList.add('mode-list');
      mobileCardList.classList.add('mode-list');
    } else {
      boardContainer.classList.remove('mode-list');
      mobileCardList.classList.remove('mode-list');
    }

    if (!currentNatal) {
      renderEmptyState();
      return;
    }

    const natal = getDisplayNatal(currentNatal);
    if (!natal || !Array.isArray(natal.palaces)) return;

    const activeRelations = currentNatal.relations?.find(r => r.branch === selectedBranch);

    // 1. Cập nhật 12 ô Cung trên Bàn Cờ
    natal.palaces.forEach(palace => {
      const cell = getPalaceCell(palace.branch);
      if (cell) {
        updatePalaceCell(cell, palace, selectedBranch, activeRelations, getBorrowedStars(palace, natal, currentNatal.facts));
      }
    });

    // 2. Cập nhật Vùng Trung Tâm
    updateCenterArea(centerCell, currentNatal, isSample, userName);

    // 3. Cập nhật Mobile Card List
    renderMobileCards(mobileCardList, natal, selectedBranch, currentNatal.facts);

    // 4. Vẽ đường liên hệ SVG
    if (showRelationLines && selectedBranch !== null && activeRelations) {
      drawRelationLines(s);
    } else {
      svgOverlay.innerHTML = '';
    }
  }

  function getPalaceCell(branch) {
    if (!Number.isInteger(branch) || branch < 0 || branch > 11) return null;
    return chartGrid.querySelector(`.palace-cell[data-branch="${branch}"]`);
  }

  function renderEmptyState() {
    centerCell.innerHTML = `
      <div class="cosmic-mandala-container">
        <div class="cosmic-mandala-ring"></div>
        <div style="position: relative; z-index: 2; text-align: center; padding: 20px;">
          <div style="font-family: var(--font-serif); font-size: 1.5rem; color: #F59E0B; margin-bottom: 8px; font-weight: 700; text-shadow: 0 0 12px rgba(245, 158, 11, 0.5);">
            THIÊN KỶ
          </div>
          <p style="font-size: 0.85rem; color: #94A3B8; max-width: 240px; line-height: 1.4; margin: 0 auto;">
            Khởi tạo dữ kiện hoặc chọn lá số mẫu để khám phá Mệnh Bàn.
          </p>
        </div>
      </div>
    `;
    svgOverlay.innerHTML = '';
    mobileCardList.replaceChildren();

    chartGrid.querySelectorAll('.palace-cell').forEach(cell => {
      const b = Number(cell.dataset.branch);
      cell.classList.remove('active', 'rel-opposite', 'rel-trine');
      cell.innerHTML = `
        <div class="cell-top">
          <div class="cell-palace-name">Cung ${BRANCH_NAMES[b]}</div>
          <div class="cell-can-chi">Chi ${b}</div>
        </div>
        <div class="cell-columns-container" style="justify-content: center; align-items: center; opacity: 0.3;">
          <span style="font-size: 0.75rem; color: #64748B;">Chờ dữ kiện...</span>
        </div>
        <div class="cell-bottom">
          <span>—</span>
          <span>${BRANCH_NAMES[b]}</span>
        </div>
      `;
    });
  }

  function updatePalaceCell(cell, palace, selectedBranch, activeRelations, borrowedStars) {
    const isSelected = palace.branch === selectedBranch;

    cell.classList.remove('active', 'rel-opposite', 'rel-trine');

    if (isSelected) {
      cell.classList.add('active');
    } else if (activeRelations) {
      if (activeRelations.opposite?.branch === palace.branch) {
        cell.classList.add('rel-opposite');
      } else if (activeRelations.trine?.some(t => t.branch === palace.branch)) {
        cell.classList.add('rel-trine');
      }
    }

    const { leftStars, rightStars } = partitionStars(palace.stars);
    const majorStars = palace.stars.filter(s => s.type === 'major');
    const isEmpty = majorStars.length === 0;

    const daXianRange = palace.daXianAge ? `${palace.daXianAge[0]} - ${palace.daXianAge[1]}` : (palace.ages ? `${palace.ages[0]} - ${palace.ages[1]}` : '—');

    cell.innerHTML = `
      <!-- Header Cung -->
      <div class="cell-top">
        <div class="cell-palace-name">
          ${escapeHtml(palace.labelVi || palace.name)}
          ${palace.isMingGong || palace.isMingPalace ? '<span class="badge-ming">MỆNH</span>' : ''}
          ${palace.isBodyPalace || palace.isShenGong ? '<span class="badge-body">THÂN</span>' : ''}
        </div>
        <div class="cell-can-chi">
          ${escapeHtml(palace.stemLabelVi)} ${escapeHtml(palace.branchLabelVi)}
        </div>
      </div>

      <div class="cell-columns-container">
        <div class="star-col col-left">
          ${isEmpty ? '<div class="empty-badge">[Vô chính diệu]</div>' : ''}
          ${leftStars.map(s => renderStarTag(s, true)).join('')}

          ${isEmpty && borrowedStars.length > 0 ? `
            <div class="borrowed-stars-box">
              <span style="font-size: 0.65rem; color: #94A3B8;">Mượn:</span>
              ${borrowedStars.map(name => `<span class="borrowed-star">${escapeHtml(name)}</span>`).join('')}
            </div>
          ` : ''}
        </div>

        <div class="star-col col-right">
          ${rightStars.map(s => renderStarTag(s, false)).join('')}
        </div>
      </div>

      <!-- Footer Cung: Đại Hạn & Vị trí -->
      <div class="cell-bottom">
        <span class="daxian-badge">ĐH: ${escapeHtml(daXianRange)}</span>
        <span style="font-size: 0.65rem; color: #64748B;">${escapeHtml(palace.branchLabelVi || palace.branch)}</span>
      </div>
    `;
  }

  function renderStarTag(star, isLeftColumn) {
    const isMajor = star.type === 'major';
    const brightness = getStarBrightness(star);
    const sihua = getStarTransformation(star);
    const starCls = `star-item ${isMajor ? 'star-major' : ''} ${isLeftColumn ? 'good-star' : 'bad-star'}`;
    const brightHtml = brightness.label
      ? `<span class="star-bright star-bright-${brightness.className}" title="${escapeHtml(brightness.label)}">(${escapeHtml(brightness.label.charAt(0))})</span>` : '';
    const sihuaHtml = sihua.label
      ? `<span class="sihua-badge ${sihua.className}" title="${escapeHtml(sihua.label)}">${escapeHtml(sihua.shortLabel)}</span>` : '';

    return `
      <div class="${starCls}">
        <span class="star-name-wrap">
          <span class="star-name">${escapeHtml(star.labelVi || star.name)}</span>
          ${brightHtml}
        </span>
        ${sihuaHtml}
      </div>
    `;
  }

  function updateCenterArea(center, currentNatal, isSample, userName) {
    const natal = getDisplayNatal(currentNatal);
    const birthInfo = natal.birthInfo || {};
    const dates = getBirthDates(currentNatal);
    const hourBranchName = BRANCH_NAMES[dates.hourBranch];
    const dateRows = [];
    if (dates.inputDate) {
      dateRows.push([dates.inputCalendar === 'lunar' ? 'Âm lịch nhập' : 'Dương lịch nhập', dates.inputDate]);
    }
    if (dates.inputCalendar === 'lunar' && dates.civilSolarDate) {
      dateRows.push(['Quy đổi dương lịch', dates.civilSolarDate]);
    }
    if (dates.inputCalendar !== 'lunar' && dates.originalLunarDate) {
      dateRows.push(['Âm lịch gốc (lịch Trung)', dates.originalLunarDate]);
    }
    dateRows.push(['Ngày lập số (dương lịch)', dates.effectiveSolarDate || '—']);
    dateRows.push(['Âm lịch dùng để an sao', dates.effectiveLunarDate || '—']);
    if (dates.inputTime) dateRows.push(['Giờ sinh đã nhập', dates.inputTime]);
    if (hourBranchName) dateRows.push(['Giờ lập số', `Giờ ${hourBranchName}`]);

    center.innerHTML = `
      <div class="center-content-wrap">
        <div class="cosmic-mandala-ring"></div>

        <div style="position: relative; z-index: 3;">
          <div class="center-brand-title">THIÊN KỶ</div>
          <div style="font-size: 0.9rem; font-weight: 700; color: #F8FAFC; margin-bottom: 2px;">
            ${escapeHtml(userName || 'Đương Số')}${birthInfo.gender === 'female' ? ' • Nữ Mệnh' : birthInfo.gender === 'male' ? ' • Nam Mệnh' : ''}
          </div>

          ${isSample ? `<div style="margin: 2px 0;"><span class="badge-tag sample">LÁ SỐ MẪU MINH HỌA</span></div>` : ''}

          <div class="center-meta-grid">
            ${dateRows.map(([label, value]) => `
              <div class="meta-item">
                <span class="meta-label">${label}</span>
                <span class="meta-val">${escapeHtml(value)}</span>
              </div>
            `).join('')}
            <div class="meta-item">
              <span class="meta-label">Cục (Ngũ Hành):</span>
              <span class="meta-val" style="color: #F59E0B;">${escapeHtml(natal.wuxingJuLabelVi || natal.wuxingJuName || '—')}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Mệnh Chủ:</span>
              <span class="meta-val">${escapeHtml(natal.mingZhuLabelVi || natal.mingZhu || '—')}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Thân Chủ:</span>
              <span class="meta-val">${escapeHtml(natal.shenZhuLabelVi || natal.shenZhu || '—')}</span>
            </div>
          </div>
        </div>

        <div style="position: relative; z-index: 3;">
          <div class="center-legend">
            <span class="sihua-badge sh-lu">Lộc</span>
            <span class="sihua-badge sh-quan">Quyền</span>
            <span class="sihua-badge sh-ke">Khoa</span>
            <span class="sihua-badge sh-ji">Kỵ</span>
          </div>
          <div style="font-size: 0.7rem; color: #94A3B8; margin-top: 4px;">
            Cột phải gồm sát/hung tinh, Hóa Kỵ và sao có độ sáng thấp
          </div>
        </div>
      </div>
    `;
  }

  function drawRelationLines(s) {
    svgOverlay.innerHTML = '';
    const { selectedBranch, currentNatal } = s;
    if (selectedBranch === null || selectedBranch === undefined) return;

    const relations = currentNatal.relations?.find(r => r.branch === selectedBranch);
    if (!relations) return;

    const svgRect = svgOverlay.getBoundingClientRect();
    if (svgRect.width === 0 || svgRect.height === 0) return;

    const activeCell = getPalaceCell(selectedBranch);
    if (!activeCell) return;

    const activeCenter = getCellCenter(activeCell, svgRect);

    // 1. Đường đối cung: Nét đứt thanh mảnh 1px, độ mờ dịu nhẹ, không glow che chữ
    if (relations.opposite) {
      const oppCell = getPalaceCell(relations.opposite.branch);
      if (oppCell) {
        const oppCenter = getCellCenter(oppCell, svgRect);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', activeCenter.x);
        line.setAttribute('y1', activeCenter.y);
        line.setAttribute('x2', oppCenter.x);
        line.setAttribute('y2', oppCenter.y);
        line.setAttribute('stroke', 'rgba(239, 68, 68, 0.45)');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '4,4');
        svgOverlay.appendChild(line);
      }
    }

    // 2. Tam giác tam hợp: Nét mảnh 1px thanh thoát, độ trong suốt cao, không chèn ép chữ
    if (relations.trine && relations.trine.length === 2) {
      const t1Cell = getPalaceCell(relations.trine[0].branch);
      const t2Cell = getPalaceCell(relations.trine[1].branch);
      if (t1Cell && t2Cell) {
        const t1Center = getCellCenter(t1Cell, svgRect);
        const t2Center = getCellCenter(t2Cell, svgRect);

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const points = `${activeCenter.x},${activeCenter.y} ${t1Center.x},${t1Center.y} ${t2Center.x},${t2Center.y}`;
        polygon.setAttribute('points', points);
        polygon.setAttribute('stroke', 'rgba(6, 182, 212, 0.45)');
        polygon.setAttribute('stroke-width', '1');
        polygon.setAttribute('fill', 'rgba(6, 182, 212, 0.02)');
        svgOverlay.appendChild(polygon);
      }
    }
  }

  function getCellCenter(cell, svgRect) {
    const rect = cell.getBoundingClientRect();
    return {
      x: rect.left - svgRect.left + rect.width / 2,
      y: rect.top - svgRect.top + rect.height / 2,
    };
  }

  function renderMobileCards(container, natal, selectedBranch, facts) {
    container.innerHTML = '';
    natal.palaces.forEach(palace => {
      const card = document.createElement('div');
      card.className = `mobile-palace-card ${palace.branch === selectedBranch ? 'active' : ''}`;
      const { leftStars, rightStars } = partitionStars(palace.stars);
      const borrowedStars = getBorrowedStars(palace, natal, facts);

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 700; font-family: var(--font-serif); font-size: 1rem; color: #F8FAFC;">
            Cung ${escapeHtml(palace.labelVi || palace.name)} (${escapeHtml(palace.stemLabelVi)} ${escapeHtml(palace.branchLabelVi)})
          </div>
          <div>
            ${palace.isMingGong || palace.isMingPalace ? '<span class="badge-ming">MỆNH</span>' : ''}
            ${palace.isBodyPalace || palace.isShenGong ? '<span class="badge-body">THÂN</span>' : ''}
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem; margin-top: 4px;">
          <div>
            <span style="color: #F59E0B; font-weight: 600;">Các sao còn lại</span>
            <div style="color: #94A3B8;">${escapeHtml(leftStars.map(s => s.labelVi || s.name).join(', ') || 'Không có')}</div>
          </div>
          <div>
            <span style="color: #F43F5E; font-weight: 600;">Sát/hung tinh, Hóa Kỵ, độ sáng thấp</span>
            <div style="color: #94A3B8;">${escapeHtml(rightStars.map(s => s.labelVi || s.name).join(', ') || 'Không có')}</div>
          </div>
        </div>
        ${borrowedStars.length ? `<p class="borrowed-stars-box">Mượn đối cung ${escapeHtml(borrowedStars.join(', '))}</p>` : ''}
      `;

      card.addEventListener('click', () => {
        state.selectPalace(palace.branch);
      });

      container.appendChild(card);
    });
  }
}
