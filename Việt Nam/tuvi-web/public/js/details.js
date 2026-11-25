/** Bảng dữ kiện của cung đang chọn (Apple Inspector Sidebar). */

import { state } from './state.js';
import { escapeHtml, getBorrowedStars, getDisplayNatal, getStarBrightness, getStarTransformation, partitionStars } from './chart.js';

export function setupDetails() {
  const detailsBody = /** @type {HTMLElement} */ (document.getElementById('details-body'));

  state.subscribe(s => {
    renderDetails(s);
  });

  function renderDetails(s) {
    const { currentNatal, selectedBranch } = s;

    if (!currentNatal) {
      detailsBody.innerHTML = `
        <div class="details-empty">
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
        <div class="details-empty">
          Chọn một cung trên bàn cờ để xem chi tiết.
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
        <div class="detail-palace-head">
          <h3 class="detail-palace-title">Cung ${escapeHtml(palace.labelVi || palace.name)}</h3>
          <span class="detail-palace-canchi">
            ${escapeHtml(palace.stemLabelVi)} ${escapeHtml(palace.branchLabelVi)}
          </span>
        </div>
        <div class="detail-palace-meta">
          <span>Đại hạn: <strong>${escapeHtml(daXianRange)}</strong></span>
          ${palace.isMingGong || palace.isMingPalace ? '<span class="badge-ming">MỆNH</span>' : ''}
          ${palace.isBodyPalace || palace.isShenGong ? '<span class="badge-body">THÂN</span>' : ''}
        </div>
      </div>

      ${isEmpty ? `
        <div class="detail-section">
          <div class="detail-section-title">Vô chính diệu</div>
          <p class="detail-note">Cung này không có chính tinh tọa thủ.</p>
          ${borrowedStars.length ? `<p class="detail-note">Mượn chính tinh từ đối cung: <strong>${escapeHtml(borrowedStars.join(', '))}</strong></p>` : ''}
        </div>
      ` : ''}

      <div class="detail-section">
        <div class="detail-section-title tone-good">Các sao còn lại (${leftStars.length})</div>
        <div class="detail-star-list">
          ${leftStars.length === 0 ? '<span class="detail-star-empty">Không có sao trong nhóm này.</span>' : ''}
          ${leftStars.map(star => renderDetailStarItem(star, true)).join('')}
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title tone-bad">Sát/hung tinh, Hóa Kỵ, độ sáng thấp (${rightStars.length})</div>
        <div class="detail-star-list">
          ${rightStars.length === 0 ? '<span class="detail-star-empty">Không có sao trong nhóm này.</span>' : ''}
          ${rightStars.map(star => renderDetailStarItem(star, false)).join('')}
        </div>
      </div>

      <!-- Tam Phương Tứ Chính Hội Chiếu -->
      ${relations ? `
        <div class="detail-section">
          <div class="detail-section-title tone-rel">Tam phương tứ chính</div>
          <div class="detail-rel-group">
            <div class="detail-rel-row">
              <span class="detail-rel-label-opp">Đối cung</span>
              <button class="btn btn-sm rel-jump-btn" data-branch="${escapeHtml(relations.opposite.branch)}" type="button">
                ${escapeHtml(getPalaceNameByBranch(natal, relations.opposite.branch))}
              </button>
            </div>
            <div>
              <span class="detail-rel-label-trine">Tam hợp chiếu</span>
              <div class="detail-trine-btns">
                ${relations.trine.map(t => `
                  <button class="btn btn-sm rel-jump-btn" data-branch="${escapeHtml(t.branch)}" type="button">
                    ${escapeHtml(getPalaceNameByBranch(natal, t.branch))}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="detail-cta-wrap">
        <button class="btn btn-primary" id="side-goto-reading-btn" type="button">
          Xem dữ kiện lá số ›
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
        if (!(btn instanceof HTMLElement)) return;
        const branch = Number(btn.dataset.branch);
        if (Number.isInteger(branch)) state.selectPalace(branch);
      });
    });
  }

  function renderDetailStarItem(star, isLeftColumn) {
    const isMajor = star.type === 'major';
    const brightness = getStarBrightness(star);
    const sihua = getStarTransformation(star);
    const nameCls = `detail-star-name ${isMajor ? 'is-major' : ''} ${!isLeftColumn ? 'is-bad' : ''}`;

    return `
      <div class="detail-star-row">
        <div class="detail-star-left">
          <span class="${nameCls}">${escapeHtml(star.labelVi || star.name)}</span>
          ${isMajor ? '<span class="detail-major-tag">Chính tinh</span>' : ''}
          ${brightness.label ? `<span class="star-bright star-bright-${brightness.className}">(${escapeHtml(brightness.label)})</span>` : ''}
        </div>
        <div>
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
