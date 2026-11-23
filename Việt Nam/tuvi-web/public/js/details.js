/** Bảng dữ kiện của cung đang chọn. */

import { state } from './state.js';
import { escapeHtml, getBorrowedStars, getDisplayNatal, getStarBrightness, getStarTransformation, partitionStars } from './chart.js';

export function setupDetails() {
  const detailsBody = document.getElementById('details-body');

  state.subscribe(s => {
    renderDetails(s);
  });

  function renderDetails(s) {
    const { currentNatal, selectedBranch } = s;

    if (!currentNatal) {
      detailsBody.innerHTML = `
        <div style="text-align: center; color: #94A3B8; padding: 40px 10px; font-size: 0.85rem;">
          Chưa có lá số để hiển thị chi tiết.
        </div>
      `;
      return;
    }

    const natal = getDisplayNatal(currentNatal);
    if (!natal || !Array.isArray(natal.palaces)) return;

    const palace = natal.palaces.find(p => p.branch === selectedBranch);
    if (!palace) {
      detailsBody.innerHTML = `
        <div style="text-align: center; color: #94A3B8; padding: 40px 10px; font-size: 0.85rem;">
          Chọn một cung trên Bàn Cờ để soi chiếu chi tiết.
        </div>
      `;
      return;
    }

    const relations = currentNatal.relations?.find(r => r.branch === selectedBranch);
    const { leftStars, rightStars } = partitionStars(palace.stars);
    const borrowedStars = getBorrowedStars(palace, natal, currentNatal.facts);
    const isEmpty = !palace.stars.some(star => star.type === 'major');
    const range = palace.daXianAge ?? palace.ages;
    const daXianRange = range ? `${range[0]}–${range[1]} tuổi` : '—';

    detailsBody.innerHTML = `
      <!-- Tiêu Đề Cung -->
      <div class="detail-section">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <h3 style="font-family: var(--font-serif); font-size: 1.35rem; color: #F59E0B; font-weight: 700; text-shadow: 0 0 10px rgba(245, 158, 11, 0.3);">
            Cung ${escapeHtml(palace.labelVi || palace.name)}
          </h3>
          <span style="font-size: 0.85rem; font-weight: 600; color: #94A3B8;">
            ${escapeHtml(palace.stemLabelVi)} ${escapeHtml(palace.branchLabelVi)}
          </span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; font-size: 0.85rem; margin-top: 4px;">
          <span>Đại hạn: <strong style="color: #F8FAFC;">${escapeHtml(daXianRange)}</strong></span>
          ${palace.isMingGong || palace.isMingPalace ? '<span class="badge-ming">MỆNH</span>' : ''}
          ${palace.isBodyPalace || palace.isShenGong ? '<span class="badge-body">THÂN</span>' : ''}
        </div>
      </div>

      ${isEmpty ? `
        <div class="detail-section">
          <div class="detail-section-title">Vô chính diệu</div>
          <p>Cung này không có chính tinh tọa thủ.</p>
          ${borrowedStars.length ? `<p>Mượn chính tinh từ đối cung: ${escapeHtml(borrowedStars.join(', '))}</p>` : ''}
        </div>
      ` : ''}

      <div class="detail-section">
        <div class="detail-section-title" style="color: #F59E0B;">Các sao còn lại (${leftStars.length})</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${leftStars.length === 0 ? '<span style="color: #94A3B8;">Không có sao trong nhóm này.</span>' : ''}
          ${leftStars.map(star => renderDetailStarItem(star, true)).join('')}
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title" style="color: #F43F5E;">Sát/hung tinh, Hóa Kỵ, độ sáng thấp (${rightStars.length})</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${rightStars.length === 0 ? '<span style="color: #94A3B8;">Không có sao trong nhóm này.</span>' : ''}
          ${rightStars.map(star => renderDetailStarItem(star, false)).join('')}
        </div>
      </div>

      <!-- Tam Phương Tứ Chính Hội Chiếu -->
      ${relations ? `
        <div class="detail-section">
          <div class="detail-section-title" style="color: #A855F7;">Tam Phương Tứ Chính (Hội chiếu)</div>
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.85rem;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="color: #EF4444; font-weight: 600;">Đối cung (Xung chiếu):</span>
              <button class="btn btn-ghost btn-sm rel-jump-btn" data-branch="${escapeHtml(relations.opposite.branch)}" type="button">
                ${escapeHtml(getPalaceNameByBranch(natal, relations.opposite.branch))}
              </button>
            </div>
            <div>
              <span style="color: #06B6D4; font-weight: 600; display: block; margin-bottom: 4px;">Tam hợp chiếu:</span>
              <div style="display: flex; gap: 6px;">
                ${relations.trine.map(t => `
                  <button class="btn btn-ghost btn-sm rel-jump-btn" data-branch="${escapeHtml(t.branch)}" type="button" style="flex: 1;">
                    ${escapeHtml(getPalaceNameByBranch(natal, t.branch))}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <div style="margin-top: 6px;">
        <button class="btn btn-primary" id="side-goto-reading-btn" type="button" style="width: 100%; padding: 11px; font-size: 0.95rem; font-weight: 700; background: linear-gradient(135deg, #7C3AED, #D97706); box-shadow: 0 0 15px rgba(124, 58, 237, 0.4);">
          Xem dữ kiện lá số
        </button>
      </div>
    `;

    const sideReadingBtn = detailsBody.querySelector('#side-goto-reading-btn');
    if (sideReadingBtn) {
      sideReadingBtn.addEventListener('click', () => {
        state.setView('reading');
      });
    }

    detailsBody.querySelectorAll('.rel-jump-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const branch = Number(btn.dataset.branch);
        if (Number.isInteger(branch)) state.selectPalace(branch);
      });
    });
  }

  function renderDetailStarItem(star, isLeftColumn) {
    const isMajor = star.type === 'major';
    const brightness = getStarBrightness(star);
    const sihua = getStarTransformation(star);

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.4); padding: 5px 8px; border-radius: 4px; border: 1px solid rgba(148, 163, 184, 0.1);">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-weight: ${isMajor ? '700' : '500'}; color: ${isMajor ? (isLeftColumn ? '#FBBF24' : '#F87171') : (isLeftColumn ? '#E2E8F0' : '#A855F7')}; font-size: 0.85rem;">
            ${escapeHtml(star.labelVi || star.name)}
          </span>
          ${isMajor ? '<span style="font-size: 0.65rem; color: #94A3B8;">(Chính tinh)</span>' : ''}
          ${brightness.label ? `<span class="star-bright star-bright-${brightness.className}">(${escapeHtml(brightness.label)})</span>` : ''}
        </div>
        <div style="display: flex; gap: 4px;">
          ${sihua.label ? `<span class="sihua-badge ${sihua.className}" title="${escapeHtml(sihua.label)}">${escapeHtml(sihua.shortLabel)}</span>` : ''}
        </div>
      </div>
    `;
  }

  function getPalaceNameByBranch(natal, branch) {
    const p = natal.palaces.find(x => x.branch === branch);
    if (!p) return `Chi ${branch}`;
    return `${p.labelVi || p.name} (${p.branchLabelVi || branch})`;
  }
}
