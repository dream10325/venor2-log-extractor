const EditorModule = (function () {

  const lineUndoHistory = {};

  function triggerInput(ta) {
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  }

  function getLineHistory(idx, initialVal) {
    if (!lineUndoHistory[idx]) {
      lineUndoHistory[idx] = {
        undo: [{ val: initialVal, start: 0, end: 0 }],
        redo: []
      };
    }
    return lineUndoHistory[idx];
  }

  function pushUndoState(idx, ta) {
    const hist = getLineHistory(idx, ta.value);
    const currentVal = ta.value;
    const last = hist.undo[hist.undo.length - 1];
    if (!last || last.val !== currentVal) {
      hist.undo.push({
        val: currentVal,
        start: ta.selectionStart,
        end: ta.selectionEnd
      });
      if (hist.undo.length > 60) hist.undo.shift();
      hist.redo = [];
    }
  }

  function doUndo(idx, ta) {
    clearTimeout(ta._typingTimer);
    const hist = getLineHistory(idx, ta.value);
    const last = hist.undo[hist.undo.length - 1];
    if (last && last.val !== ta.value) {
      hist.redo.push({
        val: ta.value,
        start: ta.selectionStart,
        end: ta.selectionEnd
      });
      ta.value = last.val;
      ta.selectionStart = last.start;
      ta.selectionEnd = last.end;
      ta._isHistoryAction = true;
      triggerInput(ta);
      ta._isHistoryAction = false;
      return;
    }
    if (hist.undo.length <= 1) return;
    const current = hist.undo.pop();
    hist.redo.push({
      val: ta.value,
      start: ta.selectionStart,
      end: ta.selectionEnd
    });
    const prev = hist.undo[hist.undo.length - 1];
    ta.value = prev.val;
    ta.selectionStart = prev.start;
    ta.selectionEnd = prev.end;
    ta._isHistoryAction = true;
    triggerInput(ta);
    ta._isHistoryAction = false;
  }

  function doRedo(idx, ta) {
    clearTimeout(ta._typingTimer);
    const hist = getLineHistory(idx, ta.value);
    if (hist.redo.length === 0) return;
    const next = hist.redo.pop();
    hist.undo.push({
      val: ta.value,
      start: ta.selectionStart,
      end: ta.selectionEnd
    });
    ta.value = next.val;
    ta.selectionStart = next.start;
    ta.selectionEnd = next.end;
    ta._isHistoryAction = true;
    triggerInput(ta);
    ta._isHistoryAction = false;
  }

  function applySimpleTag(idx, ta, tag) {
    pushUndoState(idx, ta);
    let start = ta.selectionStart;
    let end = ta.selectionEnd;
    const val = ta.value;
    const openTag = `[${tag}]`;
    const closeTag = `[/${tag}]`;
    const tagRegex = new RegExp(`\\[\\/?${tag}\\]`, 'gi');

    if (start === end) {
      const placeholder = '文字';
      ta.value = val.slice(0, start) + openTag + placeholder + closeTag + val.slice(end);
      ta.selectionStart = start + openTag.length;
      ta.selectionEnd = start + openTag.length + placeholder.length;
      pushUndoState(idx, ta);
      triggerInput(ta);
      return;
    }

    if (start >= openTag.length && end + closeTag.length <= val.length &&
        val.slice(start - openTag.length, start).toLowerCase() === openTag.toLowerCase() &&
        val.slice(end, end + closeTag.length).toLowerCase() === closeTag.toLowerCase()) {
      ta.value = val.slice(0, start - openTag.length) + val.slice(start, end) + val.slice(end + closeTag.length);
      ta.selectionStart = start - openTag.length;
      ta.selectionEnd = end - openTag.length;
      pushUndoState(idx, ta);
      triggerInput(ta);
      return;
    }

    const sel = val.slice(start, end);
    const fullWrapRegex = new RegExp(`^\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]$`, 'i');
    const match = sel.match(fullWrapRegex);
    if (match) {
      const inner = match[1];
      ta.value = val.slice(0, start) + inner + val.slice(end);
      ta.selectionStart = start;
      ta.selectionEnd = start + inner.length;
      pushUndoState(idx, ta);
      triggerInput(ta);
      return;
    }

    if (tagRegex.test(sel)) {
      const cleaned = sel.replace(tagRegex, '');
      ta.value = val.slice(0, start) + cleaned + val.slice(end);
      ta.selectionStart = start;
      ta.selectionEnd = start + cleaned.length;
      pushUndoState(idx, ta);
      triggerInput(ta);
      return;
    }

    const wrapped = openTag + sel + closeTag;
    ta.value = val.slice(0, start) + wrapped + val.slice(end);
    ta.selectionStart = start + openTag.length;
    ta.selectionEnd = start + openTag.length + sel.length;
    pushUndoState(idx, ta);
    triggerInput(ta);
  }

  function applyParamTag(idx, ta, tag, paramVal) {
    pushUndoState(idx, ta);
    let start = ta.selectionStart;
    let end = ta.selectionEnd;
    const val = ta.value;
    const openTag = `[${tag}=${paramVal}]`;
    const closeTag = `[/${tag}]`;

    if (start === end) {
      const placeholder = '文字';
      ta.value = val.slice(0, start) + openTag + placeholder + closeTag + val.slice(end);
      ta.selectionStart = start + openTag.length;
      ta.selectionEnd = start + openTag.length + placeholder.length;
      pushUndoState(idx, ta);
      triggerInput(ta);
      return;
    }

    const before = val.slice(0, start);
    const after = val.slice(end);
    const openPattern = new RegExp(`\\[(${tag})=([^\\]]+)\\]$`, 'i');
    const closePattern = new RegExp(`^\\[\\/(${tag})\\]`, 'i');

    const beforeMatch = before.match(openPattern);
    const afterMatch = after.match(closePattern);

    if (beforeMatch && afterMatch) {
      const newBefore = before.slice(0, before.length - beforeMatch[0].length) + openTag;
      const newAfter = closeTag + after.slice(afterMatch[0].length);
      const sel = val.slice(start, end);
      ta.value = newBefore + sel + newAfter;
      const newStart = before.length - beforeMatch[0].length + openTag.length;
      ta.selectionStart = newStart;
      ta.selectionEnd = newStart + sel.length;
      pushUndoState(idx, ta);
      triggerInput(ta);
      return;
    }

    const sel = val.slice(start, end);
    const wrapPattern = new RegExp(`^\\[${tag}=([^\\]]+)\\]([\\s\\S]*?)\\[\\/${tag}\\]$`, 'i');
    const wrapMatch = sel.match(wrapPattern);

    if (wrapMatch) {
      const inner = wrapMatch[2];
      const newSel = openTag + inner + closeTag;
      ta.value = before + newSel + after;
      ta.selectionStart = start + openTag.length;
      ta.selectionEnd = start + openTag.length + inner.length;
      pushUndoState(idx, ta);
      triggerInput(ta);
      return;
    }

    const internalTagRegex = new RegExp(`\\[\\/?${tag}(?:=[^\\]]+)?\\]`, 'gi');
    const cleanedSel = sel.replace(internalTagRegex, '');
    const wrapped = openTag + cleanedSel + closeTag;
    ta.value = before + wrapped + after;
    ta.selectionStart = start + openTag.length;
    ta.selectionEnd = start + openTag.length + cleanedSel.length;
    pushUndoState(idx, ta);
    triggerInput(ta);
  }

  function clearFormatting(idx, ta) {
    pushUndoState(idx, ta);
    let start = ta.selectionStart;
    let end = ta.selectionEnd;
    let val = ta.value;

    if (start === end) {
      const cleaned = BBCodeModule.stripAllBBCode(val);
      ta.value = cleaned;
      ta.selectionStart = 0;
      ta.selectionEnd = cleaned.length;
      pushUndoState(idx, ta);
      triggerInput(ta);
      return;
    }

    let before = val.slice(0, start);
    let sel = val.slice(start, end);
    let after = val.slice(end);

    let expanded = true;
    while (expanded) {
      expanded = false;
      const openM = before.match(/\[(b|i|color|bg|size)(?:=[^\]]+)?\]$/i);
      const closeM = after.match(/^\[\/(b|i|color|bg|size)\]/i);
      if (openM && closeM && openM[1].toLowerCase() === closeM[1].toLowerCase()) {
        before = before.slice(0, before.length - openM[0].length);
        after = after.slice(closeM[0].length);
        expanded = true;
      }
    }

    sel = BBCodeModule.stripAllBBCode(sel);
    ta.value = before + sel + after;
    ta.selectionStart = before.length;
    ta.selectionEnd = before.length + sel.length;
    pushUndoState(idx, ta);
    triggerInput(ta);
  }

  function clearHistory() {
    Object.keys(lineUndoHistory).forEach(k => delete lineUndoHistory[k]);
  }

  function renderSpeakerPanel(state, callbacks) {
    const box = document.getElementById('speakerList');
    const names = Object.keys(state.speakers);
    if (names.length === 0) {
      box.innerHTML = '<p class="play-hint">目前的腳本沒有偵測到任何說話者。</p>';
      return;
    }
    const counts = {};
    state.script.forEach(l => { if (l.player) counts[l.player] = (counts[l.player] || 0) + 1; });

    box.innerHTML = names.map(name => {
      const sp = state.speakers[name];
      const renamed = sp.displayName !== name;
      const portraitCards = (sp.portraits || []).map((p, idx) => `
        <div class="portrait-thumbnail-wrap">
          <div class="portrait-thumbnail ${idx === (sp.defaultPortraitIdx || 0) ? 'active' : ''}" 
               style="background-image:url('${p.url}')" 
               title="${escapeHtml(p.name)}（點擊設為預設）" 
               data-role="set-default-port" 
               data-name="${escapeHtml(name)}" 
               data-idx="${idx}"></div>
          <button type="button" class="portrait-thumb-flip-btn ${p.flip ? 'active' : ''}" 
                  data-role="toggle-portrait-flip" 
                  data-name="${escapeHtml(name)}" 
                  data-idx="${idx}">翻轉</button>
        </div>
      `).join('');

      return `
      <div class="speaker-card">
        <div class="speaker-card-head">
          <input type="color" class="speaker-color-input" data-role="speakerColor" data-name="${escapeHtml(name)}" value="${sp.color}">
          <input type="text" class="speaker-name-input" data-role="displayName" data-name="${escapeHtml(name)}" value="${escapeHtml(sp.displayName)}" placeholder="角色名稱">
          <span class="speaker-card-count">${counts[name] || 0} 句</span>
        </div>
        ${renamed ? `<p class="speaker-card-origname">原暱稱：${escapeHtml(name)}</p>` : ''}
        <div class="speaker-card-body">
          <div class="speaker-portraits-row">
            ${portraitCards || '<div class="play-hint">尚未匯入立繪</div>'}
          </div>
          <div class="speaker-card-controls">
            <label class="mini-file-btn">
              批次匯入立繪圖片
              <input type="file" accept="image/*" multiple data-role="batch-portrait" data-name="${escapeHtml(name)}">
            </label>
            <select class="pos-select" data-role="position" data-name="${escapeHtml(name)}">
              <option value="left" ${sp.position === 'left' ? 'selected' : ''}>預設靠左站位</option>
              <option value="center" ${sp.position === 'center' ? 'selected' : ''}>預設置中站位</option>
              <option value="right" ${sp.position === 'right' ? 'selected' : ''}>預設靠右站位</option>
            </select>
            <div class="slider-group">
              <label>立繪大小縮放：<span id="scaleVal_${escapeHtml(name)}">${Math.round((sp.scale || 1) * 100)}%</span></label>
              <input type="range" min="0.4" max="2.0" step="0.05" value="${sp.scale || 1}" data-role="portScale" data-name="${escapeHtml(name)}">
            </div>
            <div class="slider-group">
              <label>水平位置微調 (X)：<span id="offXVal_${escapeHtml(name)}">${sp.offsetX || 0}px</span></label>
              <input type="range" min="-300" max="300" step="5" value="${sp.offsetX || 0}" data-role="portOffX" data-name="${escapeHtml(name)}">
            </div>
            <div class="slider-group">
              <label>垂直位置微調 (Y)：<span id="offYVal_${escapeHtml(name)}">${sp.offsetY || 0}px</span></label>
              <input type="range" min="-200" max="200" step="5" value="${sp.offsetY || 0}" data-role="portOffY" data-name="${escapeHtml(name)}">
            </div>
            ${(sp.portraits && sp.portraits.length) ? `<button type="button" class="portrait-clear-btn" data-role="portrait-clear-all" data-name="${escapeHtml(name)}">清空所有立繪</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('input[data-role=speakerColor]').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.getAttribute('data-name');
        state.speakers[name].color = inp.value;
        callbacks.onRedraw();
      });
      inp.addEventListener('click', e => e.stopPropagation());
    });

    box.querySelectorAll('input[data-role=displayName]').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.getAttribute('data-name');
        state.speakers[name].displayName = inp.value.trim() || name;
        callbacks.onUpdateLines();
        callbacks.onRedraw();
      });
      inp.addEventListener('click', e => e.stopPropagation());
    });

    box.querySelectorAll('input[data-role=batch-portrait]').forEach(inp => {
      inp.addEventListener('change', e => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        const name = inp.getAttribute('data-name');
        const sp = state.speakers[name];
        files.forEach(f => {
          const url = URL.createObjectURL(f);
          sp.portraits.push({ name: f.name, file: f, url, flip: false });
        });
        renderSpeakerPanel(state, callbacks);
        callbacks.onUpdateLines();
        callbacks.onRedraw();
      });
    });

    box.querySelectorAll('[data-role=set-default-port]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-name');
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        state.speakers[name].defaultPortraitIdx = idx;
        renderSpeakerPanel(state, callbacks);
        callbacks.onRedraw();
      });
    });

    box.querySelectorAll('[data-role=toggle-portrait-flip]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const name = btn.getAttribute('data-name');
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        const p = state.speakers[name].portraits[idx];
        if (p) {
          p.flip = !p.flip;
          renderSpeakerPanel(state, callbacks);
          callbacks.onRedraw();
        }
      });
    });

    box.querySelectorAll('[data-role=portrait-clear-all]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-name');
        state.speakers[name].portraits = [];
        state.speakers[name].defaultPortraitIdx = 0;
        renderSpeakerPanel(state, callbacks);
        callbacks.onUpdateLines();
        callbacks.onRedraw();
      });
    });

    box.querySelectorAll('select[data-role=position]').forEach(sel => {
      sel.addEventListener('change', () => {
        const name = sel.getAttribute('data-name');
        state.speakers[name].position = sel.value;
        callbacks.onRedraw();
      });
    });

    box.querySelectorAll('input[data-role=portScale]').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.getAttribute('data-name');
        state.speakers[name].scale = parseFloat(inp.value);
        document.getElementById('scaleVal_' + name).textContent = Math.round(state.speakers[name].scale * 100) + '%';
        callbacks.onRedraw();
      });
    });

    box.querySelectorAll('input[data-role=portOffX]').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.getAttribute('data-name');
        state.speakers[name].offsetX = parseInt(inp.value, 10);
        document.getElementById('offXVal_' + name).textContent = state.speakers[name].offsetX + 'px';
        callbacks.onRedraw();
      });
    });

    box.querySelectorAll('input[data-role=portOffY]').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.getAttribute('data-name');
        state.speakers[name].offsetY = parseInt(inp.value, 10);
        document.getElementById('offYVal_' + name).textContent = state.speakers[name].offsetY + 'px';
        callbacks.onRedraw();
      });
    });
  }

  function speakerLabelFor(line, speakers) {
    const sp = line.player ? speakers[line.player] : null;
    if (line.type === 'chat') return sp ? sp.displayName : (line.player || '');
    return sp ? `${sp.displayName}（動作）` : '旁白／動作';
  }

  function highlightCurrentLineRow(index) {
    document.querySelectorAll('.line-row').forEach(row => {
      row.classList.toggle('current', parseInt(row.getAttribute('data-index'), 10) === index);
    });
    const cur = document.querySelector('.line-row.current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  let dragSrcIndex = null;

  function renderLinePanel(state, callbacks) {
    const box = document.getElementById('lineList');
    if (state.script.length === 0) { box.innerHTML = ''; return; }

    const allSpeakerNames = Object.keys(state.speakers);

    box.innerHTML = state.script.map((line, i) => {
      const ov = state.lineOverrides[line.key] || {};
      const speakerLabel = speakerLabelFor(line, state.speakers);

      const isNarration = line.type !== 'chat';
      let effectiveSpeakerName = line.player;
      if (isNarration) {
        effectiveSpeakerName = ov.speaker !== undefined ? ov.speaker : (line.player || '');
      }
      const sp = effectiveSpeakerName ? state.speakers[effectiveSpeakerName] : null;

      const tags = [];
      if (ov.portraitIdx !== undefined && ov.portraitIdx !== null) tags.push('<span class="line-override-tag">[立繪]</span>');
      if (ov.flip !== undefined) tags.push('<span class="line-override-tag">[翻轉]</span>');
      if (ov.bgURL) tags.push('<span class="line-override-tag">[換背景]</span>');
      if (ov.bgmAction === 'set') tags.push('<span class="line-override-tag">[換BGM]</span>');
      if (ov.bgmAction === 'stop') tags.push('<span class="line-override-tag">[停BGM]</span>');
      if (ov.illustURL) tags.push('<span class="line-override-tag">[插圖]</span>');
      if (ov.sfxURL) tags.push('<span class="line-override-tag">[音效]</span>');

      let narrationSpeakerSelectHtml = '';
      if (isNarration) {
        narrationSpeakerSelectHtml = `
          <select class="pos-select" style="max-width:110px;" data-role="line-speaker-select" data-index="${i}">
            <option value="">（不指定立繪）</option>
            ${allSpeakerNames.map(name => `
              <option value="${escapeHtml(name)}" ${effectiveSpeakerName === name ? 'selected' : ''}>${escapeHtml(state.speakers[name].displayName)}</option>
            `).join('')}
          </select>
        `;
      }

      let portraitSelectHtml = '';
      if (sp && sp.portraits && sp.portraits.length > 0) {
        portraitSelectHtml = `
          <select class="pos-select" style="max-width:110px;" data-role="line-portrait-select" data-index="${i}">
            <option value="">預設立繪</option>
            ${sp.portraits.map((p, pIdx) => `
              <option value="${pIdx}" ${ov.portraitIdx === pIdx ? 'selected' : ''}>${escapeHtml(p.name)}</option>
            `).join('')}
          </select>
        `;
      }

      let isFlipActive = false;
      if (ov.flip !== undefined) {
        isFlipActive = !!ov.flip;
      } else if (sp && sp.portraits && sp.portraits.length > 0) {
        const pIdx = (ov.portraitIdx !== undefined && ov.portraitIdx !== null) ? ov.portraitIdx : (sp.defaultPortraitIdx || 0);
        isFlipActive = sp.portraits[pIdx] ? !!sp.portraits[pIdx].flip : false;
      }

      return `
      <div class="line-row" draggable="true" data-index="${i}">
        <div class="line-row-head">
          <span class="line-drag-handle" title="拖曳排序">☰</span>
          <span class="line-idx">#${i + 1}</span>
          <span class="line-tag ${line.type}">${line.type === 'chat' ? '對話' : '動作'}</span>
          <span class="line-speaker">${escapeHtml(speakerLabel)}</span>
          <button type="button" class="line-del-btn" data-role="line-del" data-index="${i}" title="刪除本句">✕</button>
        </div>
        <div class="line-fmt-bar" data-index="${i}">
          <button type="button" class="fmt-btn" data-fmt="b" title="粗體"><b>B</b></button>
          <button type="button" class="fmt-btn" data-fmt="i" title="斜體"><i>I</i></button>
          <select class="fmt-select" data-fmt="size" title="字級">
            <option value="">字級</option>
            <option value="14">小</option>
            <option value="20">中</option>
            <option value="26">大</option>
            <option value="34">特大</option>
          </select>
          <label class="fmt-color-label" title="選取文字顏色">
            字色<input type="color" data-fmt="color" value="#ff5555">
          </label>
          <label class="fmt-color-label" title="選取文字底色">
            底色<input type="color" data-fmt="bg" value="#ffee55">
          </label>
          <button type="button" class="fmt-btn-text" data-fmt="clear" title="清除選取樣式或整行樣式">清除樣式</button>
        </div>
        <textarea class="line-text-edit" data-role="line-text" data-index="${i}" rows="2">${escapeHtml(line.text)}</textarea>
        <div class="line-row-actions">
          ${narrationSpeakerSelectHtml}
          ${portraitSelectHtml}
          <button type="button" class="mini-file-btn ${isFlipActive ? 'active' : ''}" data-role="line-flip-btn" data-index="${i}">翻轉</button>
          <label class="mini-file-btn" onclick="event.stopPropagation()">
            畫面插圖
            <input type="file" accept="image/*" data-role="line-illust" data-index="${i}">
          </label>
          <label class="mini-file-btn" onclick="event.stopPropagation()">
            換背景
            <input type="file" accept="image/*" data-role="line-bg" data-index="${i}">
          </label>
          <label class="mini-file-btn" onclick="event.stopPropagation()">
            換BGM
            <input type="file" accept="audio/*" data-role="line-bgm" data-index="${i}">
          </label>
          <button type="button" class="mini-file-btn" data-role="line-bgm-stop" data-index="${i}">停BGM</button>
          <label class="mini-file-btn" onclick="event.stopPropagation()">
            單句音效
            <input type="file" accept="audio/*" data-role="line-sfx" data-index="${i}">
          </label>
          <input type="range" class="line-sfx-vol" min="0" max="1" step="0.05" value="${ov.sfxVolume !== undefined ? ov.sfxVolume : 0.9}" data-role="line-sfx-vol" data-index="${i}" title="音效音量" style="width:50px;">
          <button type="button" class="mini-file-btn" data-role="line-insert-above" data-index="${i}">上方插入</button>
          <button type="button" class="mini-file-btn" data-role="line-insert-below" data-index="${i}">下方插入</button>
          ${tags.length ? `<button type="button" class="mini-file-btn" data-role="line-clear" data-index="${i}">清除指定</button>` : ''}
          ${tags.join('')}
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('.line-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        dragSrcIndex = parseInt(row.getAttribute('data-index'), 10);
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          row.classList.add('drag-over-top');
          row.classList.remove('drag-over-bottom');
        } else {
          row.classList.add('drag-over-bottom');
          row.classList.remove('drag-over-top');
        }
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over-top');
        row.classList.remove('drag-over-bottom');
      });
      row.addEventListener('drop', e => {
        e.preventDefault();
        row.classList.remove('drag-over-top');
        row.classList.remove('drag-over-bottom');
        const targetIndex = parseInt(row.getAttribute('data-index'), 10);
        if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertAfter = e.clientY >= midY;
        callbacks.onReorder(dragSrcIndex, targetIndex, insertAfter);
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        document.querySelectorAll('.line-row').forEach(r => {
          r.classList.remove('drag-over-top');
          r.classList.remove('drag-over-bottom');
        });
      });
    });

    box.querySelectorAll('.line-fmt-bar').forEach(bar => {
      const idx = parseInt(bar.getAttribute('data-index'), 10);
      const ta = bar.parentElement.querySelector('textarea[data-role=line-text]');
      let savedStart = 0;
      let savedEnd = 0;

      function saveSelection() {
        savedStart = ta.selectionStart;
        savedEnd = ta.selectionEnd;
      }

      function restoreSelection() {
        ta.selectionStart = savedStart;
        ta.selectionEnd = savedEnd;
      }

      bar.addEventListener('pointerdown', () => {
        saveSelection();
      });

      bar.querySelectorAll('button[data-fmt]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          restoreSelection();
          const fmt = btn.getAttribute('data-fmt');
          if (fmt === 'b' || fmt === 'i') {
            applySimpleTag(idx, ta, fmt);
          } else if (fmt === 'clear') {
            clearFormatting(idx, ta);
          }
        });
      });

      const sizeSel = bar.querySelector('select[data-fmt=size]');
      sizeSel.addEventListener('click', e => e.stopPropagation());
      sizeSel.addEventListener('change', e => {
        e.stopPropagation();
        if (!sizeSel.value) return;
        restoreSelection();
        applyParamTag(idx, ta, 'size', sizeSel.value);
        sizeSel.value = '';
      });

      const colorInp = bar.querySelector('input[data-fmt=color]');
      colorInp.parentElement.addEventListener('click', e => e.stopPropagation());
      colorInp.addEventListener('change', e => {
        restoreSelection();
        applyParamTag(idx, ta, 'color', colorInp.value);
      });

      const bgInp = bar.querySelector('input[data-fmt=bg]');
      bgInp.parentElement.addEventListener('click', e => e.stopPropagation());
      bgInp.addEventListener('change', e => {
        restoreSelection();
        applyParamTag(idx, ta, 'bg', bgInp.value);
      });
    });

    box.querySelectorAll('.line-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.getAttribute('data-index'), 10);
        callbacks.onSelectLine(idx);
      });
    });

    box.querySelectorAll('textarea[data-role=line-text]').forEach(ta => {
      const idx = parseInt(ta.getAttribute('data-index'), 10);
      getLineHistory(idx, ta.value);

      ta.addEventListener('click', e => e.stopPropagation());

      ta.addEventListener('focus', () => {
        pushUndoState(idx, ta);
      });

      ta.addEventListener('compositionend', () => {
        pushUndoState(idx, ta);
      });

      ta.addEventListener('keydown', e => {
        e.stopPropagation();

        const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
        const isCtrl = isMac ? e.metaKey : e.ctrlKey;
        const key = e.key ? e.key.toLowerCase() : '';

        const isUndo = isCtrl && key === 'z' && !e.shiftKey;
        const isRedo = (isCtrl && key === 'y') || (isCtrl && key === 'z' && e.shiftKey);

        if (isUndo) {
          e.preventDefault();
          doUndo(idx, ta);
          return;
        }

        if (isRedo) {
          e.preventDefault();
          doRedo(idx, ta);
          return;
        }
      });

      ta.addEventListener('input', () => {
        state.script[idx].text = ta.value;
        if (idx === state.index) {
          callbacks.onCurrentLineTextChange();
        }

        if (ta._isHistoryAction) return;

        clearTimeout(ta._typingTimer);
        ta._typingTimer = setTimeout(() => {
          pushUndoState(idx, ta);
        }, 400);
      });
    });

    box.querySelectorAll('select[data-role=line-speaker-select]').forEach(sel => {
      sel.addEventListener('click', e => e.stopPropagation());
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], {
          speaker: sel.value || null,
          portraitIdx: null
        });
        renderLinePanel(state, callbacks);
        if (idx === state.index) callbacks.onRedraw();
      });
    });

    box.querySelectorAll('select[data-role=line-portrait-select]').forEach(sel => {
      sel.addEventListener('click', e => e.stopPropagation());
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        const val = sel.value === '' ? null : parseInt(sel.value, 10);
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], { portraitIdx: val });
        renderLinePanel(state, callbacks);
        if (idx === state.index) callbacks.onRedraw();
      });
    });

    box.querySelectorAll('[data-role=line-flip-btn]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        const currentOv = state.lineOverrides[key] || {};
        let nextFlip = true;
        if (currentOv.flip !== undefined) {
          nextFlip = !currentOv.flip;
        } else {
          const spName = currentOv.speaker || state.script[idx].player;
          const sp = spName ? state.speakers[spName] : null;
          const pIdx = currentOv.portraitIdx !== undefined && currentOv.portraitIdx !== null ? currentOv.portraitIdx : (sp ? sp.defaultPortraitIdx || 0 : 0);
          const baseFlip = sp && sp.portraits && sp.portraits[pIdx] ? !!sp.portraits[pIdx].flip : false;
          nextFlip = !baseFlip;
        }
        state.lineOverrides[key] = Object.assign({}, currentOv, { flip: nextFlip });
        renderLinePanel(state, callbacks);
        if (idx === state.index) callbacks.onRedraw();
      });
    });

    box.querySelectorAll('input[data-role=line-illust]').forEach(inp => {
      inp.addEventListener('click', e => e.stopPropagation());
      inp.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const idx = parseInt(inp.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        const url = URL.createObjectURL(file);
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], { illustURL: url, illustFile: file, illustName: file.name });
        renderLinePanel(state, callbacks);
        if (idx === state.index) callbacks.onRedraw();
      });
    });

    box.querySelectorAll('input[data-role=line-bg]').forEach(inp => {
      inp.addEventListener('click', e => e.stopPropagation());
      inp.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const idx = parseInt(inp.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        const url = URL.createObjectURL(file);
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], { bgURL: url, bgFile: file, bgName: file.name });
        renderLinePanel(state, callbacks);
        if (idx === state.index) callbacks.onRedraw();
      });
    });

    box.querySelectorAll('input[data-role=line-bgm]').forEach(inp => {
      inp.addEventListener('click', e => e.stopPropagation());
      inp.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const idx = parseInt(inp.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        const url = URL.createObjectURL(file);
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], { bgmAction: 'set', bgmURL: url, bgmFile: file, bgmName: file.name });
        renderLinePanel(state, callbacks);
        if (idx === state.index) callbacks.onBgmChange(idx);
      });
    });

    box.querySelectorAll('[data-role=line-bgm-stop]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], { bgmAction: 'stop', bgmURL: null, bgmFile: null, bgmName: '' });
        renderLinePanel(state, callbacks);
        if (idx === state.index) callbacks.onBgmChange(idx);
      });
    });

    box.querySelectorAll('input[data-role=line-sfx]').forEach(inp => {
      inp.addEventListener('click', e => e.stopPropagation());
      inp.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const idx = parseInt(inp.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        const url = URL.createObjectURL(file);
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], { sfxURL: url, sfxFile: file, sfxName: file.name });
        renderLinePanel(state, callbacks);
      });
    });

    box.querySelectorAll('input[data-role=line-sfx-vol]').forEach(inp => {
      inp.addEventListener('click', e => e.stopPropagation());
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], { sfxVolume: parseFloat(inp.value) });
      });
    });

    box.querySelectorAll('[data-role=line-del]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        callbacks.onDeleteLine(idx);
      });
    });

    box.querySelectorAll('[data-role=line-insert-above]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        callbacks.onInsertLine(idx, false);
      });
    });

    box.querySelectorAll('[data-role=line-insert-below]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        callbacks.onInsertLine(idx, true);
      });
    });

    box.querySelectorAll('[data-role=line-clear]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        delete state.lineOverrides[key];
        renderLinePanel(state, callbacks);
        if (idx === state.index) callbacks.onRedraw();
      });
    });

    highlightCurrentLineRow(state.index);
  }

  return {
    clearHistory,
    renderSpeakerPanel,
    renderLinePanel,
    highlightCurrentLineRow
  };
})();