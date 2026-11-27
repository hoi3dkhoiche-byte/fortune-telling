import { getDisplayNatal } from './chart.js';
import { fetchModelStatus, interpretNatalApi } from './api.js';

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

/**
 * Hiển thị khu vực chạy lớp model kiểm định cấu trúc (Mock đối chứng hoặc LLM cục bộ)
 * kèm chọn cung trọng tâm, trạng thái runtime, chuỗi suy luận <think> và trích dẫn Thiên Kỷ.
 *
 * @param {HTMLElement} container
 * @param {any} result
 * @param {{ initialFocusPalace?: string }} [options]
 */
export function renderModelPanel(container, result, options = {}) {
  if (!result?.natal) return;
  const displayNatal = getDisplayNatal(result);
  const card = document.createElement('section');
  card.className = 'reading-card model-panel';

  const headRow = document.createElement('div');
  headRow.className = 'model-panel-head';
  const heading = document.createElement('h2');
  heading.className = 'reading-card-title';
  heading.textContent = 'Đối chiếu dữ kiện & Lớp Model';
  const runtimeBadge = document.createElement('span');
  runtimeBadge.className = 'model-runtime-badge';
  runtimeBadge.textContent = 'Đang kiểm tra runtime…';
  headRow.append(heading, runtimeBadge);

  if (result.importedFromFile === true) {
    const unverifiedMsg = document.createElement('div');
    unverifiedMsg.className = 'alert-box alert-warning';
    unverifiedMsg.textContent = 'Lá số đang xem được mở từ file JSON ngoài (chưa được máy chủ kiểm chứng lại). Để đảm bảo tính toàn vẹn dữ kiện, lớp model bị vô hiệu hóa với file nhập ngoài — hãy nhập ngày giờ sinh để lập lá số trực tiếp từ engine.';
    card.append(headRow, unverifiedMsg);
    container.append(card);
    return;
  }

  const privacyNote = document.createElement('p');
  privacyNote.className = 'model-privacy-note';
  privacyNote.textContent = 'Quyền riêng tư: họ tên, ngày giờ sinh dương/âm, múi giờ và tọa độ không được gửi sang model (câu hỏi chứa ngày giờ sinh cũng bị chặn). Lưu ý: tổ hợp sao, Cục và vị trí Mệnh/Thân vẫn có khả năng suy ngược khoảng thời gian sinh, nên mặc định hệ thống chỉ cho phép kết nối model cục bộ (localhost).';

  const controls = document.createElement('div');
  controls.className = 'model-controls';

  const focusSelect = document.createElement('select');
  focusSelect.id = 'model-focus-palace';
  focusSelect.className = 'form-select model-focus-select';
  focusSelect.setAttribute('aria-label', 'Cung trọng tâm phân tích');
  const defaultFocusOpt = document.createElement('option');
  defaultFocusOpt.value = '';
  defaultFocusOpt.textContent = 'Trọng tâm: Toàn cục (Mệnh · Thân · Tứ Hóa)';
  focusSelect.append(defaultFocusOpt);
  for (const palace of displayNatal?.palaces || []) {
    const opt = document.createElement('option');
    opt.value = palace.id || palace.labelVi || palace.name;
    const pLabel = palace.labelVi || palace.name;
    const bLabel = palace.branchLabelVi ? ` (${palace.branchLabelVi})` : '';
    opt.textContent = `Cung ${pLabel}${bLabel}`;
    focusSelect.append(opt);
  }
  if (options.initialFocusPalace) {
    focusSelect.value = options.initialFocusPalace;
  }

  const questionInput = document.createElement('input');
  questionInput.type = 'text';
  questionInput.className = 'form-input';
  questionInput.placeholder = 'Câu hỏi chuyên đề (tùy chọn, không nhập ngày giờ sinh — ví dụ: hướng rèn luyện sự nghiệp)...';
  questionInput.maxLength = 500;
  questionInput.setAttribute('aria-label', 'Câu hỏi phân tích lá số');

  const modeSelect = document.createElement('select');
  modeSelect.className = 'form-select model-mode-select';
  modeSelect.setAttribute('aria-label', 'Chế độ model');
  for (const [val, label] of [
    ['mock', 'Đối chứng cấu trúc kỹ thuật (Mock · Không suy luận AI)'],
    ['local', 'LLM cục bộ (Ollama / vLLM · localhost)'],
  ]) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    modeSelect.append(opt);
  }

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'btn btn-primary btn-sm';
  runBtn.textContent = 'Chạy đối chiếu';

  controls.append(focusSelect, questionInput, modeSelect, runBtn);

  // Probe local LLM runtime status asynchronously so trained models on Ollama/vLLM are auto-detected
  let userChangedMode = false;
  modeSelect.addEventListener('change', () => { userChangedMode = true; });
  fetchModelStatus().then(status => {
    if (status?.localReachable) {
      const modelLabel = status.configuredModel || 'localhost';
      runtimeBadge.textContent = status.modelLoaded === false
        ? `Runtime online · Chưa nạp ${modelLabel}`
        : `LLM cục bộ sẵn sàng · ${modelLabel}`;
      runtimeBadge.classList.add('is-online');
      if (!userChangedMode && status.defaultMode === 'local' && status.modelLoaded !== false) {
        modeSelect.value = 'local';
      }
    } else {
      runtimeBadge.textContent = 'Chế độ đối chứng (Ollama/vLLM đang tắt)';
    }
  });

  const highlightFactRow = factId => {
    const rows = container.querySelectorAll('[data-fact-id]');
    for (const el of rows) {
      if (el instanceof HTMLElement && el.dataset.factId === factId) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('fact-row-highlight');
        setTimeout(() => el.classList.remove('fact-row-highlight'), 1800);
        return;
      }
    }
  };

  const outputArea = document.createElement('div');
  outputArea.className = 'model-output';

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.textContent = 'Đang xử lý…';
    outputArea.replaceChildren();
    const res = await interpretNatalApi({
      natalResult: result,
      question: questionInput.value.trim() || undefined,
      focusPalace: focusSelect.value || undefined,
      mode: modeSelect.value,
    });
    runBtn.disabled = false;
    runBtn.textContent = 'Chạy đối chiếu';
    if (res.aborted) return;

    if (res.httpStatus === 422 && res.data?.status === 'invalid_model_output') {
      const warnBox = document.createElement('div');
      warnBox.className = 'alert-box alert-warning';
      const errCount = res.data.validation?.errors?.length || 0;
      warnBox.textContent = `Bộ kiểm định đã chặn hiển thị phản hồi sau ${res.data.attempts || 1} lần thử do phát hiện ${errCount} lỗi không khớp dữ kiện/quy tắc:`;
      outputArea.append(warnBox);

      if (Array.isArray(res.data.validation?.errors) && res.data.validation.errors.length > 0) {
        const errList = document.createElement('ul');
        errList.className = 'reading-card-body model-error-list';
        for (const issue of res.data.validation.errors) {
          const li = document.createElement('li');
          li.textContent = `[${issue.code}] (${issue.path}): ${issue.message}`;
          errList.append(li);
        }
        outputArea.append(errList);
      }
      return;
    }

    if (res.httpStatus !== 200 || res.data?.status !== 'ok' || !res.data?.validation?.valid || !res.data?.interpretation) {
      const errBox = document.createElement('div');
      errBox.className = 'alert-box alert-error';
      errBox.textContent = res.data?.error || `Không chạy được lớp model (HTTP ${res.httpStatus}).`;
      outputArea.append(errBox);
      return;
    }

    const { interpretation, validation, retrievedQuotes = [], adapter } = res.data;
    const quoteMap = new Map(retrievedQuotes.map(q => [q.id, q]));

    const statusBar = document.createElement('div');
    statusBar.className = 'alert-box model-status-ok';
    statusBar.textContent = adapter?.kind === 'mock'
      ? `Chế độ đối chứng kỹ thuật (không suy luận AI): đã kiểm tra ${validation.metrics.verifiedAssertionCount} assertions cấu trúc trên ${validation.metrics.citedFactCount} factIds (Adapter: ${adapter.id}).`
      : `Đã vượt qua bộ kiểm định cấu trúc (${validation.metrics.groundedClaimCount}/${validation.metrics.claimCount} nhận định · ${validation.metrics.verifiedAssertionCount} assertions khớp ${validation.metrics.citedFactCount} factIds · Adapter: ${adapter.id}).`;
    outputArea.append(statusBar);

    if (interpretation?.summary) {
      const summaryP = document.createElement('p');
      summaryP.className = 'reading-card-body';
      summaryP.textContent = interpretation.summary;
      outputArea.append(summaryP);
    }

    if (Array.isArray(interpretation?.reasoningSteps) && interpretation.reasoningSteps.length > 0) {
      const cotDetails = document.createElement('details');
      cotDetails.className = 'verification model-cot-box';
      const cotSummary = document.createElement('summary');
      cotSummary.textContent = `Chuỗi suy luận kiểm chứng (${interpretation.reasoningSteps.length} bước)`;
      const cotList = document.createElement('ol');
      cotList.className = 'reading-card-body fact-list';
      for (const stepText of interpretation.reasoningSteps) {
        const li = document.createElement('li');
        li.textContent = stepText;
        cotList.append(li);
      }
      cotDetails.append(cotSummary, cotList);
      outputArea.append(cotDetails);
    }

    if (Array.isArray(interpretation?.claims) && interpretation.claims.length > 0) {
      const list = document.createElement('ul');
      list.className = 'reading-card-body model-claim-list';
      for (const claim of interpretation.claims) {
        const li = document.createElement('li');
        li.className = 'model-claim-item';
        const textP = document.createElement('p');
        textP.textContent = claim.statement;
        li.append(textP);

        const meta = document.createElement('div');
        meta.className = 'model-claim-meta';
        for (const fid of claim.factIds || []) {
          const badge = document.createElement('button');
          badge.type = 'button';
          badge.className = 'fact-id-pill';
          badge.textContent = fid;
          badge.title = 'Nhấn để đối chiếu dòng dữ kiện gốc ở trên';
          badge.addEventListener('click', () => highlightFactRow(fid));
          meta.append(badge);
        }
        for (const qid of claim.quoteIds || []) {
          const quote = quoteMap.get(qid);
          if (quote?.url) {
            const link = document.createElement('a');
            link.className = 'quote-id-pill';
            link.href = quote.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = `${qid} (${quote.timestamp})`;
            link.title = quote.text;
            meta.append(link);
          }
        }
        li.append(meta);
        list.append(li);
      }
      outputArea.append(list);
    }

    if (Array.isArray(interpretation?.actionGuidance) && interpretation.actionGuidance.length > 0) {
      const guidanceTitle = document.createElement('h3');
      guidanceTitle.className = 'model-sub-title';
      guidanceTitle.textContent = 'Định hướng hành động (Dĩ quả quyết hành)';
      const guidanceList = document.createElement('ul');
      guidanceList.className = 'reading-card-body fact-list';
      for (const item of interpretation.actionGuidance) {
        const li = document.createElement('li');
        li.textContent = item;
        guidanceList.append(li);
      }
      outputArea.append(guidanceTitle, guidanceList);
    }

    if (retrievedQuotes.length > 0) {
      const details = document.createElement('details');
      details.className = 'verification';
      const summary = document.createElement('summary');
      summary.textContent = `Trích dẫn bài giảng Thiên Kỷ đã truy xuất (${retrievedQuotes.length} câu)`;
      details.append(summary);
      const qList = document.createElement('ul');
      qList.className = 'reading-card-body model-quote-list';
      for (const q of retrievedQuotes) {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = q.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `[${q.id} · ${q.sourceFile} ${q.timestamp}]`;
        const span = document.createElement('span');
        span.textContent = ` 「${q.text}」`;
        li.append(link, span);
        qList.append(li);
      }
      details.append(qList);
      outputArea.append(details);
    }

    if (interpretation?.disclaimer) {
      const disc = document.createElement('p');
      disc.className = 'model-disclaimer';
      disc.textContent = interpretation.disclaimer;
      outputArea.append(disc);
    }
  });

  card.append(headRow, privacyNote, controls, outputArea);
  container.append(card);
}
