/**
 * Quản lý Bàn Cờ Lá Số 4x4 — Phong Cách Vũ Trụ Sâu Thẳm (Cosmic Space)
 * Quy tắc cốt lõi: Sao Đẹp (Cát tinh) nằm bên TRÁI, Sao Xấu (Sát tinh) nằm bên PHẢI
 */

import { state } from './state.js';

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
  const leftStars = [];  // Sao đẹp / Cát tinh / Chính tinh tốt
  const rightStars = []; // Sao xấu / Sát tinh / Bại tinh / Ám tinh

  stars.forEach(star => {
    const nameVi = star.labelVi || star.name;
    const isBad = BAD_STAR_NAMES.has(nameVi);
    const isSha = star.type === 'sha';
    const isJi = star.siHua === 'ji' || star.siHua === '忌' || star.siHuaLabelVi === 'Hóa Kỵ';
    const isXian = star.brightnessRaw === 'xian' || star.brightnessRaw === '陷';

    if (isBad || isSha || isJi) {
      rightStars.push(star);
    } else if (star.type === 'major' && isXian) {
      // Chính tinh hãm địa đặt bên phải
      rightStars.push(star);
    } else {
      // Chính tinh miếu/vượng/đắc, cát tinh, lộc/quyền/khoa đặt bên trái
      leftStars.push(star);
    }
  });

  return { leftStars, rightStars };
}

export function setupChart() {
  const boardContainer = document.getElementById('board-container');
  const chartGrid = document.getElementById('chart-grid');
  const svgOverlay = document.getElementById('relations-svg');
  const centerCell = document.getElementById('center-cell');
  const mobileCardList = document.getElementById('mobile-card-list');

  const branchNames = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];

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

    const natal = currentNatal.displayNatal || currentNatal.natal;
    if (!natal || !Array.isArray(natal.palaces)) return;

    const activeRelations = currentNatal.relations?.find(r => r.branch === selectedBranch);

    // 1. Cập nhật 12 ô Cung trên Bàn Cờ
    natal.palaces.forEach(palace => {
      const cell = chartGrid.querySelector(`.palace-cell[data-branch="${palace.branch}"]`);
      if (cell) {
        updatePalaceCell(cell, palace, selectedBranch, activeRelations, currentNatal.facts);
      }
    });

    // 2. Cập nhật Vùng Trung Tâm
    updateCenterArea(centerCell, currentNatal, isSample, userName);

    // 3. Cập nhật Mobile Card List
    renderMobileCards(mobileCardList, natal.palaces, selectedBranch);

    // 4. Vẽ đường liên hệ SVG
    if (showRelationLines && selectedBranch !== null && activeRelations) {
      drawRelationLines(s);
    } else {
      svgOverlay.innerHTML = '';
    }
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

    chartGrid.querySelectorAll('.palace-cell').forEach(cell => {
      const b = Number(cell.dataset.branch);
      cell.innerHTML = `
        <div class="cell-top">
          <div class="cell-palace-name">Cung ${branchNames[b]}</div>
          <div class="cell-can-chi">Chi ${b}</div>
        </div>
        <div class="cell-columns-container" style="justify-content: center; align-items: center; opacity: 0.3;">
          <span style="font-size: 0.75rem; color: #64748B;">Chờ dữ kiện...</span>
        </div>
        <div class="cell-bottom">
          <span>—</span>
          <span>${branchNames[b]}</span>
        </div>
      `;
    });
  }

  function updatePalaceCell(cell, palace, selectedBranch, activeRelations, facts) {
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

    // Bố cục phân đôi: Sao đẹp (Cát) bên TRÁI, Sao xấu (Sát) bên PHẢI
    const { leftStars, rightStars } = partitionStars(palace.stars);
    const majorStars = palace.stars.filter(s => s.type === 'major');
    const isEmpty = majorStars.length === 0;

    const borrowedStarFacts = (facts || []).filter(
      f => f.predicate === 'BORROWS_OPPOSITE_MAJOR_STAR' && f.subjectId === palace.id
    );

    const daXianRange = palace.daXianAge ? `${palace.daXianAge[0]} - ${palace.daXianAge[1]}` : (palace.ages ? `${palace.ages[0]} - ${palace.ages[1]}` : '—');

    cell.innerHTML = `
      <!-- Header Cung -->
      <div class="cell-top">
        <div class="cell-palace-name">
          ${palace.labelVi || palace.name}
          ${palace.isMingGong || palace.isMingPalace ? '<span class="badge-ming">MỆNH</span>' : ''}
          ${palace.isBodyPalace || palace.isShenGong ? '<span class="badge-body">THÂN</span>' : ''}
        </div>
        <div class="cell-can-chi">
          ${palace.stemLabelVi || ''} ${palace.branchLabelVi || ''}
        </div>
      </div>

      <!-- Thân Ô Cung: 2 Cột (Trái: Cát Tinh, Phải: Sát Tinh) -->
      <div class="cell-columns-container">
        <!-- Cột Trái: Sao Tốt, Cát Tinh -->
        <div class="star-col col-left">
          ${isEmpty ? '<div class="empty-badge">[Vô chính diệu]</div>' : ''}
          ${leftStars.map(s => renderStarTag(s, true)).join('')}

          ${isEmpty && borrowedStarFacts.length > 0 ? `
            <div class="borrowed-stars-box">
              <span style="font-size: 0.65rem; color: #94A3B8;">Mượn:</span>
              ${borrowedStarFacts.map(f => `<span class="borrowed-star">${f.objectId.replace('STAR.', '')}</span>`).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Cột Phải: Sao Xấu, Sát Tinh, Bại Tinh -->
        <div class="star-col col-right">
          ${rightStars.map(s => renderStarTag(s, false)).join('')}
        </div>
      </div>

      <!-- Footer Cung: Đại Hạn & Vị trí -->
      <div class="cell-bottom">
        <span class="daxian-badge">ĐH: ${daXianRange}</span>
        <span style="font-size: 0.65rem; color: #64748B;">${palace.branchLabelVi || palace.branch}</span>
      </div>
    `;
  }

  function renderStarTag(star, isGood) {
    const isMajor = star.type === 'major';
    const brightness = star.brightnessLabelVi || star.brightnessRaw || '';
    const brightnessCls = getBrightnessClass(star.brightnessRaw);

    const sihua = star.siHuaLabelVi || star.siHua || '';
    const sihuaCls = getSihuaClass(star.siHua);

    let starCls = 'star-item ';
    if (isMajor) starCls += 'star-major ';
    if (isGood) starCls += 'good-star ';
    else starCls += 'bad-star ';

    // Độ sáng: typography thanh lịch trong ngoặc đơn (M), (V), (Đ), (L), (B), (H)
    // Không dùng ô nền màu đặc thô kệch
    let brightHtml = '';
    if (brightness) {
      const char = brightness.charAt(0).toUpperCase();
      brightHtml = `<span class="star-bright star-bright-${brightnessCls}">(${char})</span>`;
    }

    // Tứ Hóa: hiển thị viên nhãn tinh tế [Lộc], [Quyền], [Khoa], [Kỵ] với viền mảnh bán trong suốt
    let sihuaHtml = '';
    if (sihua) {
      let shortName = 'Hóa';
      if (sihua.includes('Lộc') || star.siHua === 'lu' || star.siHua === '禄') shortName = 'Lộc';
      else if (sihua.includes('Quyền') || star.siHua === 'quan' || star.siHua === '权') shortName = 'Quyền';
      else if (sihua.includes('Khoa') || star.siHua === 'ke' || star.siHua === '科') shortName = 'Khoa';
      else if (sihua.includes('Kỵ') || star.siHua === 'ji' || star.siHua === '忌') shortName = 'Kỵ';

      sihuaHtml = `<span class="sihua-badge ${sihuaCls}" title="${sihua}">${shortName}</span>`;
    }

    return `
      <div class="${starCls}">
        <span class="star-name-wrap">
          <span class="star-name">${star.labelVi || star.name}</span>
          ${brightHtml}
        </span>
        ${sihuaHtml}
      </div>
    `;
  }

  function getBrightnessClass(raw) {
    switch (raw) {
      case '庙': case 'miao': return 'b-miao';
      case '旺': case 'wang': return 'b-wang';
      case '得': case 'de':   return 'b-de';
      case '利': case 'li':   return 'b-li';
      case '平': case 'ping': return 'b-ping';
      case '陷': case 'xian': return 'b-xian';
      default: return '';
    }
  }

  function getSihuaClass(raw) {
    switch (raw) {
      case '禄': case 'lu':   return 'sh-lu';
      case '权': case 'quan': return 'sh-quan';
      case '科': case 'ke':   return 'sh-ke';
      case '忌': case 'ji':   return 'sh-ji';
      default: return '';
    }
  }

  function updateCenterArea(center, currentNatal, isSample, userName) {
    const natal = currentNatal.displayNatal || currentNatal.natal;
    const norm = currentNatal.normalization;
    const birthInfo = natal.birthInfo || {};
    const lunar = natal.lunarInfo || {};

    const branchNames = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
    const hourBranchName = norm?.chart ? branchNames[norm.chart.hourBranch] : (birthInfo.hour !== undefined ? branchNames[birthInfo.hour] : '—');

    center.innerHTML = `
      <div class="center-content-wrap">
        <div class="cosmic-mandala-ring"></div>

        <div style="position: relative; z-index: 3;">
          <div class="center-brand-title">THIÊN KỶ</div>
          <div style="font-size: 0.9rem; font-weight: 700; color: #F8FAFC; margin-bottom: 2px;">
            ${userName || 'Đương Số'} • ${birthInfo.gender === 'female' ? 'Nữ Mệnh' : 'Nam Mệnh'}
          </div>

          ${isSample ? `<div style="margin: 2px 0;"><span class="badge-tag sample">LÁ SỐ MẪU MINH HỌA</span></div>` : ''}

          <div class="center-meta-grid">
            <div class="meta-item">
              <span class="meta-label">Dương Lịch:</span>
              <span class="meta-val">${norm?.chart?.year ?? birthInfo.year}-${String(norm?.chart?.month ?? birthInfo.month).padStart(2, '0')}-${String(norm?.chart?.day ?? birthInfo.day).padStart(2, '0')}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Âm Lịch:</span>
              <span class="meta-val">${lunar.lunarYear ?? '—'}-${String(lunar.lunarMonth ?? '—').padStart(2, '0')}-${String(lunar.lunarDay ?? '—').padStart(2, '0')} ${lunar.isLeapMonth ? '(Nhuận)' : ''}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Giờ Sinh:</span>
              <span class="meta-val">Giờ ${hourBranchName} (Chi ${norm?.chart?.hourBranch ?? birthInfo.hour ?? '—'})</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Cục (Ngũ Hành):</span>
              <span class="meta-val" style="color: #F59E0B;">${natal.wuxingJuLabelVi || natal.wuxingJuName || '—'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Mệnh Chủ:</span>
              <span class="meta-val">${natal.mingZhuLabelVi || natal.mingZhu || '—'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Thân Chủ:</span>
              <span class="meta-val">${natal.shenZhuLabelVi || natal.shenZhu || '—'}</span>
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
            Trái: Cát tinh • Phải: Sát tinh
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

    const activeCell = chartGrid.querySelector(`.palace-cell[data-branch="${selectedBranch}"]`);
    if (!activeCell) return;

    const activeCenter = getCellCenter(activeCell, svgRect);

    // 1. Đường đối cung: Nét đứt thanh mảnh 1px, độ mờ dịu nhẹ, không glow che chữ
    if (relations.opposite) {
      const oppCell = chartGrid.querySelector(`.palace-cell[data-branch="${relations.opposite.branch}"]`);
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
      const t1Cell = chartGrid.querySelector(`.palace-cell[data-branch="${relations.trine[0].branch}"]`);
      const t2Cell = chartGrid.querySelector(`.palace-cell[data-branch="${relations.trine[1].branch}"]`);
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

  function renderMobileCards(container, palaces, selectedBranch) {
    container.innerHTML = '';
    palaces.forEach(palace => {
      const card = document.createElement('div');
      card.className = `mobile-palace-card ${palace.branch === selectedBranch ? 'active' : ''}`;
      const { leftStars, rightStars } = partitionStars(palace.stars);

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 700; font-family: var(--font-serif); font-size: 1rem; color: #F8FAFC;">
            Cung ${palace.labelVi || palace.name} (${palace.stemLabelVi || ''} ${palace.branchLabelVi || ''})
          </div>
          <div>
            ${palace.isMingGong || palace.isMingPalace ? '<span class="badge-ming">MỆNH</span>' : ''}
            ${palace.isBodyPalace || palace.isShenGong ? '<span class="badge-body">THÂN</span>' : ''}
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem; margin-top: 4px;">
          <div>
            <span style="color: #F59E0B; font-weight: 600;">Cát tinh:</span>
            <div style="color: #94A3B8;">${leftStars.map(s => s.labelVi || s.name).join(', ') || 'Không có'}</div>
          </div>
          <div>
            <span style="color: #F43F5E; font-weight: 600;">Sát/Hung tinh:</span>
            <div style="color: #94A3B8;">${rightStars.map(s => s.labelVi || s.name).join(', ') || 'Không có'}</div>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        state.selectPalace(palace.branch);
      });

      container.appendChild(card);
    });
  }
}
