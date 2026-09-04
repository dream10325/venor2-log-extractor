(function () {

  const COLOR_PALETTE = [
    '#800020', '#1d5fae', '#2e7d32', '#8e44ad', '#c2740c',
    '#0b7285', '#a12f5e', '#5d4037', '#37474f', '#6a1b9a'
  ];

  const state = {
    script: [],
    speakers: {},
    lineOverrides: {},
    defaultBgURL: null,
    defaultBgFile: null,
    defaultBgName: '',
    defaultBgmURL: null,
    defaultBgmFile: null,
    defaultBgmName: '',
    bgmVolume: 0.6,
    currentBgmKey: null,
    index: 0,
    typing: false,
    typeTimer: null,
    typeSpeed: 28,
    autoDelay: 1200,
    autoPlay: false,
    autoTimer: null,
    textStyle: {
      fontFamily: "Arial, 'Microsoft JhengHei', sans-serif",
      fontSize: 17,
      bold: false,
      italic: false,
      textColor: '#f2f2f2',
      boxBgColor: '#0e0e11',
      boxOpacity: 0.86
    }
  };

  const lineUndoHistory = {};

  function $(id) { return document.getElementById(id); }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function lineKey(e) {
    return `${e.type}|${e.player || ''}|${e.text}`;
  }

  function colorForSpeaker(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) { hash = (hash * 31 + name.charCodeAt(i)) >>> 0; }
    return COLOR_PALETTE[hash % COLOR_PALETTE.length];
  }

  function ensureSpeaker(name) {
    if (!state.speakers[name]) {
      const used = Object.values(state.speakers).map(s => s.position);
      let pos = 'center';
      if (!used.includes('left')) pos = 'left';
      else if (!used.includes('right')) pos = 'right';
      state.speakers[name] = {
        name,
        displayName: name,
        color: colorForSpeaker(name),
        portraits: [],
        defaultPortraitIdx: 0,
        position: pos,
        scale: 1,
        offsetX: 0,
        offsetY: 0
      };
    }
    return state.speakers[name];
  }

  function repeatSuffixSafe(line) {
    return (line.count && line.count > 1) ? ` (x${line.count})` : '';
  }

  function actionDisplayText(line) {
    if (line.type !== 'action' || !line.player) return line.text;
    const sp = state.speakers[line.player];
    if (!sp || sp.displayName === line.player) return line.text;
    const name = line.player;
    const text = line.text;
    const prefixes = [`* ${name} `, `* ${name}\u3000`];
    for (const p of prefixes) {
      if (text.startsWith(p)) {
        return `* ${sp.displayName} ` + text.slice(p.length);
      }
    }
    if (text === `* ${name}`) {
      return `* ${sp.displayName}`;
    }
    return text;
  }

  function displayTextFor(line) {
    return line.type === 'action' ? actionDisplayText(line) : line.text;
  }

  function stripAllBBCode(text) {
    return (text || '').replace(/\[\/?(b|i|color|bg|size)(?:=[^\]]+)?\]/gi, '');
  }

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
      const cleaned = stripAllBBCode(val);
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

    sel = stripAllBBCode(sel);
    ta.value = before + sel + after;
    ta.selectionStart = before.length;
    ta.selectionEnd = before.length + sel.length;
    pushUndoState(idx, ta);
    triggerInput(ta);
  }

  function parseFormattedTokens(text) {
    const regex = /\[(\/?)(b|i|color|bg|size)(?:=([^\]]+))?\]/gi;
    const stack = [];
    const tokens = [];
    let lastIndex = 0;
    let m;

    function getActiveStyle() {
      const st = {};
      for (const item of stack) {
        if (item.tag === 'b') st.bold = true;
        else if (item.tag === 'i') st.italic = true;
        else if (item.tag === 'color') st.color = item.val;
        else if (item.tag === 'bg') st.bg = item.val;
        else if (item.tag === 'size') st.size = item.val;
      }
      return st;
    }

    while ((m = regex.exec(text)) !== null) {
      const plain = text.slice(lastIndex, m.index);
      if (plain) {
        const currentStyle = getActiveStyle();
        for (const ch of plain) {
          tokens.push({ char: ch, style: currentStyle });
        }
      }
      const isClosing = m[1] === '/';
      const tag = m[2].toLowerCase();
      const val = m[3];

      if (isClosing) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tag) {
            stack.splice(i, 1);
            break;
          }
        }
      } else {
        stack.push({ tag, val });
      }
      lastIndex = regex.lastIndex;
    }

    const tail = text.slice(lastIndex);
    if (tail) {
      const currentStyle = getActiveStyle();
      for (const ch of tail) {
        tokens.push({ char: ch, style: currentStyle });
      }
    }
    return tokens;
  }

  function tokensToHtml(tokens) {
    if (!tokens || !tokens.length) return '';
    let html = '';

    function isSameStyle(s1, s2) {
      if (!s1 || !s2) return s1 === s2;
      return s1.bold === s2.bold &&
             s1.italic === s2.italic &&
             s1.color === s2.color &&
             s1.bg === s2.bg &&
             s1.size === s2.size;
    }

    function buildStyleAttr(st) {
      if (!st) return '';
      const styles = [];
      if (st.bold) styles.push('font-weight:bold');
      if (st.italic) styles.push('font-style:italic');
      if (st.color) styles.push(`color:${escapeHtml(st.color)}`);
      if (st.bg) styles.push(`background-color:${escapeHtml(st.bg)};border-radius:3px;padding:0 2px`);
      if (st.size) {
        const s = /^\d+$/.test(st.size) ? st.size + 'px' : st.size;
        styles.push(`font-size:${escapeHtml(s)}`);
      }
      return styles.length ? ` style="${styles.join(';')}"` : '';
    }

    let chunkText = '';
    let chunkStyle = null;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (i === 0) {
        chunkText = t.char;
        chunkStyle = t.style;
      } else if (isSameStyle(t.style, chunkStyle)) {
        chunkText += t.char;
      } else {
        const attr = buildStyleAttr(chunkStyle);
        html += attr ? `<span${attr}>${escapeHtml(chunkText)}</span>` : escapeHtml(chunkText);
        chunkText = t.char;
        chunkStyle = t.style;
      }
    }
    if (chunkText) {
      const attr = buildStyleAttr(chunkStyle);
      html += attr ? `<span${attr}>${escapeHtml(chunkText)}</span>` : escapeHtml(chunkText);
    }
    return html;
  }

  function getSourceEntries() {
    if (typeof lastFiltered !== 'undefined' && lastFiltered.length) return lastFiltered;
    if (typeof entries !== 'undefined' && entries.length) {
      lastFiltered = runFilter();
      renderOutput(lastFiltered);
      return lastFiltered;
    }
    return [];
  }

  function buildScript(src) {
    state.script = src.map(e => ({
      type: e.type,
      player: e.player,
      text: e.text,
      count: e.count,
      key: lineKey(e),
    }));
    state.script.forEach(line => {
      if (line.player) ensureSpeaker(line.player);
    });
  }

  function applyTextStyle() {
    const root = document.documentElement;
    const s = state.textStyle;
    root.style.setProperty('--vn-font-family', s.fontFamily);
    root.style.setProperty('--vn-font-size', s.fontSize + 'px');
    root.style.setProperty('--vn-font-weight', s.bold ? '700' : 'normal');
    root.style.setProperty('--vn-font-style', s.italic ? 'italic' : 'normal');
    root.style.setProperty('--vn-text-color', s.textColor);

    const r = parseInt(s.boxBgColor.slice(1, 3), 16) || 14;
    const g = parseInt(s.boxBgColor.slice(3, 5), 16) || 14;
    const b = parseInt(s.boxBgColor.slice(5, 7), 16) || 17;
    root.style.setProperty('--vn-box-bg', `rgba(${r}, ${g}, ${b}, ${s.boxOpacity})`);
  }

  function openPlayerUI() {
    state.index = 0;
    state.currentBgmKey = null;
    Object.keys(lineUndoHistory).forEach(k => delete lineUndoHistory[k]);
    applyTextStyle();
    renderSpeakerPanel();
    renderLinePanel();
    syncSettingsPanelFromState();
    $('playerView').hidden = false;
    document.body.style.overflow = 'hidden';
    showLine(0, { resetTyping: true });
  }

  function openPlayer() {
    const src = getSourceEntries();
    if (!src.length) {
      alert('目前沒有可播放的內容，請先在上方貼上/匯入 Log，並確認「輸出結果」有東西。');
      return;
    }
    buildScript(src);
    openPlayerUI();
  }

  function closePlayer() {
    setAutoPlay(false);
    clearTyping();
    const audio = $('bgmAudio');
    audio.pause();
    state.currentBgmKey = null;
    $('playerView').hidden = true;
    document.body.style.overflow = '';
  }

  function renderSpeakerPanel() {
    const box = $('speakerList');
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
        <div class="portrait-thumbnail ${idx === (sp.defaultPortraitIdx || 0) ? 'active' : ''}" 
             style="background-image:url('${p.url}')" 
             title="${escapeHtml(p.name)}（點擊設為預設）" 
             data-role="set-default-port" 
             data-name="${escapeHtml(name)}" 
             data-idx="${idx}"></div>
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
        showLine(state.index, { resetTyping: false, redrawOnly: true });
      });
      inp.addEventListener('click', e => e.stopPropagation());
    });

    box.querySelectorAll('input[data-role=displayName]').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.getAttribute('data-name');
        state.speakers[name].displayName = inp.value.trim() || name;
        renderLinePanel();
        showLine(state.index, { resetTyping: false, redrawOnly: true });
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
          sp.portraits.push({ name: f.name, file: f, url });
        });
        renderSpeakerPanel();
        renderLinePanel();
        showLine(state.index, { resetTyping: false, redrawOnly: true });
      });
    });

    box.querySelectorAll('[data-role=set-default-port]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-name');
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        state.speakers[name].defaultPortraitIdx = idx;
        renderSpeakerPanel();
        showLine(state.index, { resetTyping: false, redrawOnly: true });
      });
    });

    box.querySelectorAll('[data-role=portrait-clear-all]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-name');
        state.speakers[name].portraits = [];
        state.speakers[name].defaultPortraitIdx = 0;
        renderSpeakerPanel();
        renderLinePanel();
        showLine(state.index, { resetTyping: false, redrawOnly: true });
      });
    });

    box.querySelectorAll('select[data-role=position]').forEach(sel => {
      sel.addEventListener('change', () => {
        const name = sel.getAttribute('data-name');
        state.speakers[name].position = sel.value;
        showLine(state.index, { resetTyping: false, redrawOnly: true });
      });
    });

    box.querySelectorAll('input[data-role=portScale]').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.getAttribute('data-name');
        state.speakers[name].scale = parseFloat(inp.value);
        $('scaleVal_' + name).textContent = Math.round(state.speakers[name].scale * 100) + '%';
        showLine(state.index, { resetTyping: false, redrawOnly: true });
      });
    });

    box.querySelectorAll('input[data-role=portOffX]').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.getAttribute('data-name');
        state.speakers[name].offsetX = parseInt(inp.value, 10);
        $('offXVal_' + name).textContent = state.speakers[name].offsetX + 'px';
        showLine(state.index, { resetTyping: false, redrawOnly: true });
      });
    });

    box.querySelectorAll('input[data-role=portOffY]').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.getAttribute('data-name');
        state.speakers[name].offsetY = parseInt(inp.value, 10);
        $('offYVal_' + name).textContent = state.speakers[name].offsetY + 'px';
        showLine(state.index, { resetTyping: false, redrawOnly: true });
      });
    });
  }

  function speakerLabelFor(line) {
    const sp = line.player ? state.speakers[line.player] : null;
    if (line.type === 'chat') return sp ? sp.displayName : (line.player || '');
    return sp ? `${sp.displayName}（動作）` : '旁白／動作';
  }

  function renderLinePanel() {
    const box = $('lineList');
    if (state.script.length === 0) { box.innerHTML = ''; return; }

    box.innerHTML = state.script.map((line, i) => {
      const ov = state.lineOverrides[line.key] || {};
      const speakerLabel = speakerLabelFor(line);
      const sp = line.player ? state.speakers[line.player] : null;

      const tags = [];
      if (ov.portraitIdx !== undefined && ov.portraitIdx !== null) tags.push('<span class="line-override-tag">[立繪]</span>');
      if (ov.bgURL) tags.push('<span class="line-override-tag">[換背景]</span>');
      if (ov.bgmAction === 'set') tags.push('<span class="line-override-tag">[換BGM]</span>');
      if (ov.bgmAction === 'stop') tags.push('<span class="line-override-tag">[停BGM]</span>');
      if (ov.illustURL) tags.push('<span class="line-override-tag">[插圖]</span>');
      if (ov.sfxURL) tags.push('<span class="line-override-tag">[音效]</span>');

      let portraitSelectHtml = '';
      if (sp && sp.portraits && sp.portraits.length > 0) {
        portraitSelectHtml = `
          <select class="pos-select" style="max-width:130px;" data-role="line-portrait-select" data-index="${i}">
            <option value="">預設立繪</option>
            ${sp.portraits.map((p, pIdx) => `
              <option value="${pIdx}" ${ov.portraitIdx === pIdx ? 'selected' : ''}>${escapeHtml(p.name)}</option>
            `).join('')}
          </select>
        `;
      }

      return `
      <div class="line-row" data-index="${i}">
        <div class="line-row-head">
          <span class="line-idx">#${i + 1}</span>
          <span class="line-tag ${line.type}">${line.type === 'chat' ? '對話' : '動作'}</span>
          <span class="line-speaker">${escapeHtml(speakerLabel)}</span>
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
          ${portraitSelectHtml}
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
          ${tags.length ? `<button type="button" class="mini-file-btn" data-role="line-clear" data-index="${i}">清除指定</button>` : ''}
          ${tags.join('')}
        </div>
      </div>`;
    }).join('');

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
        setAutoPlay(false);
        showLine(idx, { resetTyping: true });
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
          clearTyping();
          const full = displayTextFor(state.script[idx]) + repeatSuffixSafe(state.script[idx]);
          $('vnText').innerHTML = tokensToHtml(parseFormattedTokens(full));
        }

        if (ta._isHistoryAction) return;

        clearTimeout(ta._typingTimer);
        ta._typingTimer = setTimeout(() => {
          pushUndoState(idx, ta);
        }, 400);
      });
    });

    box.querySelectorAll('select[data-role=line-portrait-select]').forEach(sel => {
      sel.addEventListener('click', e => e.stopPropagation());
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        const val = sel.value === '' ? null : parseInt(sel.value, 10);
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], { portraitIdx: val });
        renderLinePanel();
        if (idx === state.index) showLine(idx, { resetTyping: false, redrawOnly: true });
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
        renderLinePanel();
        if (idx === state.index) showLine(idx, { resetTyping: false, redrawOnly: true });
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
        renderLinePanel();
        if (idx === state.index) showLine(idx, { resetTyping: false, redrawOnly: true });
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
        renderLinePanel();
        if (idx === state.index) updateBgmForLine(idx);
      });
    });

    box.querySelectorAll('[data-role=line-bgm-stop]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], { bgmAction: 'stop', bgmURL: null, bgmFile: null, bgmName: '' });
        renderLinePanel();
        if (idx === state.index) updateBgmForLine(idx);
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
        renderLinePanel();
      });
    });

    box.querySelectorAll('[data-role=line-clear]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        delete state.lineOverrides[key];
        renderLinePanel();
        if (idx === state.index) showLine(idx, { resetTyping: false, redrawOnly: true });
      });
    });

    highlightCurrentLineRow();
  }

  function highlightCurrentLineRow() {
    document.querySelectorAll('.line-row').forEach(row => {
      row.classList.toggle('current', parseInt(row.getAttribute('data-index'), 10) === state.index);
    });
    const cur = document.querySelector('.line-row.current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function clearTyping() {
    if (state.typeTimer) { clearInterval(state.typeTimer); state.typeTimer = null; }
    state.typing = false;
  }

  function clearAutoTimer() {
    if (state.autoTimer) { clearTimeout(state.autoTimer); state.autoTimer = null; }
  }

  function resolvePortraitURL(sp, ov) {
    if (!sp || !sp.portraits || sp.portraits.length === 0) return null;
    if (ov && ov.portraitIdx !== undefined && ov.portraitIdx !== null && sp.portraits[ov.portraitIdx]) {
      return sp.portraits[ov.portraitIdx].url;
    }
    const defIdx = sp.defaultPortraitIdx || 0;
    return sp.portraits[defIdx] ? sp.portraits[defIdx].url : sp.portraits[0].url;
  }

  function resolveBackgroundURL(ov) {
    return (ov && ov.bgURL) || state.defaultBgURL || null;
  }

  function getEffectiveBgm(idx) {
    for (let i = idx; i >= 0; i--) {
      const l = state.script[i];
      const ov = state.lineOverrides[l.key];
      if (ov) {
        if (ov.bgmAction === 'stop') return null;
        if (ov.bgmAction === 'set' && ov.bgmURL) return { key: 'line_' + i + '_' + ov.bgmName, url: ov.bgmURL };
      }
    }
    return state.defaultBgmURL ? { key: 'default_' + state.defaultBgmName, url: state.defaultBgmURL } : null;
  }

  function updateBgmForLine(idx) {
    const eff = getEffectiveBgm(idx);
    const audio = $('bgmAudio');
    if (!eff) {
      if (state.currentBgmKey !== null) {
        audio.pause();
        audio.removeAttribute('src');
        state.currentBgmKey = null;
      }
      return;
    }
    if (state.currentBgmKey !== eff.key) {
      state.currentBgmKey = eff.key;
      audio.src = eff.url;
      audio.volume = state.bgmVolume;
      audio.loop = true;
      audio.play().catch(() => {});
    }
  }

  function applySpeakerTransform(el, sp) {
    const scale = sp.scale || 1;
    const offX = sp.offsetX || 0;
    const offY = sp.offsetY || 0;
    if (sp.position === 'center') {
      el.style.left = `calc(50% + ${offX}px)`;
      el.style.right = 'auto';
      el.style.transform = `translateX(-50%) translateY(${offY}px) scale(${scale})`;
    } else if (sp.position === 'left') {
      el.style.left = `calc(2% + ${offX}px)`;
      el.style.right = 'auto';
      el.style.transform = `translateY(${offY}px) scale(${scale})`;
    } else {
      el.style.left = 'auto';
      el.style.right = `calc(2% - ${offX}px)`;
      el.style.transform = `translateY(${offY}px) scale(${scale})`;
    }
  }

  function showLine(idx, opts) {
    opts = opts || {};
    if (idx < 0 || idx >= state.script.length) return;
    state.index = idx;
    clearAutoTimer();

    const line = state.script[idx];
    const ov = state.lineOverrides[line.key] || {};

    $('vnProgress').textContent = `${idx + 1} / ${state.script.length}`;
    highlightCurrentLineRow();

    const vnBox = $('vnBox');
    const stageBg = $('stageBg');

    ['Left', 'Center', 'Right'].forEach(pos => {
      const slot = $('portrait' + pos);
      slot.classList.remove('active');
      slot.style.left = '';
      slot.style.right = '';
      slot.style.transform = '';
    });

    const bgURL = resolveBackgroundURL(ov);
    if (bgURL) {
      stageBg.style.backgroundImage = `url('${bgURL}')`;
      stageBg.classList.add('on');
    } else {
      stageBg.classList.remove('on');
      stageBg.style.backgroundImage = '';
    }

    const illustBox = $('stageIllust');
    const illustImg = $('stageIllustImg');
    if (ov.illustURL) {
      illustImg.src = ov.illustURL;
      illustBox.classList.add('active');
    } else {
      illustBox.classList.remove('active');
      illustImg.removeAttribute('src');
    }

    updateBgmForLine(idx);

    if (line.type === 'chat') {
      vnBox.classList.remove('narration');
      const sp = state.speakers[line.player] || ensureSpeaker(line.player || '未知角色');
      $('vnName').textContent = sp.displayName;
      vnBox.style.setProperty('--vn-name-color', sp.color);

      const imgURL = resolvePortraitURL(sp, ov);
      const posKey = capitalize(sp.position);
      const slot = $('portrait' + posKey);
      if (imgURL) {
        $('portrait' + posKey + 'Img').src = imgURL;
        applySpeakerTransform(slot, sp);
        slot.classList.add('active');
      }
    } else {
      vnBox.classList.add('narration');
      $('vnName').textContent = '';
      const sp = line.player ? state.speakers[line.player] : null;
      const imgURL = resolvePortraitURL(sp, ov);
      if (sp && imgURL) {
        const posKey = capitalize(sp.position);
        const slot = $('portrait' + posKey);
        $('portrait' + posKey + 'Img').src = imgURL;
        applySpeakerTransform(slot, sp);
        slot.classList.add('active');
      }
    }

    if (!opts.redrawOnly && ov.sfxURL) {
      const sfx = new Audio(ov.sfxURL);
      sfx.volume = 0.9;
      sfx.play().catch(() => {});
    }

    if (opts.redrawOnly) return;

    clearTyping();
    const textEl = $('vnText');
    const full = displayTextFor(line) + repeatSuffixSafe(line);
    const tokens = parseFormattedTokens(full);
    textEl.innerHTML = '';
    let i = 0;
    state.typing = true;
    state.typeTimer = setInterval(() => {
      i++;
      textEl.innerHTML = tokensToHtml(tokens.slice(0, i));
      if (i >= tokens.length) {
        clearTyping();
        onLineFullyShown();
      }
    }, Math.max(6, state.typeSpeed));
  }

  function completeTyping() {
    if (!state.typing) return;
    clearTyping();
    const line = state.script[state.index];
    const full = displayTextFor(line) + repeatSuffixSafe(line);
    const tokens = parseFormattedTokens(full);
    $('vnText').innerHTML = tokensToHtml(tokens);
    onLineFullyShown();
  }

  function onLineFullyShown() {
    if (state.autoPlay) {
      state.autoTimer = setTimeout(() => {
        if (!nextLine()) setAutoPlay(false);
      }, state.autoDelay);
    }
  }

  function nextLine() {
    if (state.index >= state.script.length - 1) return false;
    showLine(state.index + 1, { resetTyping: true });
    return true;
  }
  function prevLine() {
    if (state.index <= 0) return false;
    showLine(state.index - 1, { resetTyping: true });
    return true;
  }

  function handleAdvance() {
    if (state.typing) { completeTyping(); return; }
    nextLine();
  }

  function setAutoPlay(on) {
    state.autoPlay = on;
    const btn = $('autoPlayBtn');
    btn.classList.toggle('autoplay-on', on);
    btn.textContent = on ? '自動播放中' : '自動播放';
    clearAutoTimer();
    if (on && !state.typing) onLineFullyShown();
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('讀取檔案失敗：' + file.name));
      reader.readAsDataURL(file);
    });
  }

  async function buildExportPayload() {
    const speakersOut = {};
    for (const name of Object.keys(state.speakers)) {
      const sp = state.speakers[name];
      const portsOut = [];
      for (const p of (sp.portraits || [])) {
        portsOut.push({
          name: p.name,
          data: p.file ? await fileToDataURL(p.file) : p.url
        });
      }
      speakersOut[name] = {
        displayName: sp.displayName,
        color: sp.color,
        position: sp.position,
        scale: sp.scale,
        offsetX: sp.offsetX,
        offsetY: sp.offsetY,
        defaultPortraitIdx: sp.defaultPortraitIdx,
        portraits: portsOut
      };
    }

    const overridesOut = {};
    for (const key of Object.keys(state.lineOverrides)) {
      const ov = state.lineOverrides[key];
      const out = {};
      if (ov.portraitIdx !== undefined && ov.portraitIdx !== null) out.portraitIdx = ov.portraitIdx;
      if (ov.bgFile) out.bg = await fileToDataURL(ov.bgFile);
      else if (ov.bgURL && ov.bgURL.startsWith('data:')) out.bg = ov.bgURL;
      if (ov.illustFile) out.illust = await fileToDataURL(ov.illustFile);
      else if (ov.illustURL && ov.illustURL.startsWith('data:')) out.illust = ov.illustURL;
      if (ov.sfxFile) out.sfx = await fileToDataURL(ov.sfxFile);
      else if (ov.sfxURL && ov.sfxURL.startsWith('data:')) out.sfx = ov.sfxURL;
      if (ov.bgmAction) {
        out.bgmAction = ov.bgmAction;
        if (ov.bgmFile) out.bgm = await fileToDataURL(ov.bgmFile);
        else if (ov.bgmURL && ov.bgmURL.startsWith('data:')) out.bg = ov.bgmURL;
      }
      if (Object.keys(out).length) overridesOut[key] = out;
    }

    return {
      script: state.script.map(l => ({ type: l.type, player: l.player, text: l.text, count: l.count, key: l.key })),
      speakers: speakersOut,
      overrides: overridesOut,
      defaultBg: state.defaultBgFile ? await fileToDataURL(state.defaultBgFile) : (state.defaultBgURL && state.defaultBgURL.startsWith('data:') ? state.defaultBgURL : null),
      defaultBgm: state.defaultBgmFile ? await fileToDataURL(state.defaultBgmFile) : (state.defaultBgmURL && state.defaultBgmURL.startsWith('data:') ? state.defaultBgmURL : null),
      bgmVolume: state.bgmVolume,
      typeSpeed: state.typeSpeed,
      autoDelay: state.autoDelay,
      textStyle: state.textStyle
    };
  }

  function buildStandaloneHtml(payload) {
    const json = JSON.stringify(payload)
      .replace(/</g, '\\u003c')
      .replace(/-->/g, '--\\u003e');
    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>劇情播放</title>
<style>
:root{
  --accent:#800020; --accent-2:#008000;
  --vn-font-family:${payload.textStyle.fontFamily};
  --vn-font-size:${payload.textStyle.fontSize}px;
  --vn-font-weight:${payload.textStyle.bold ? '700' : 'normal'};
  --vn-font-style:${payload.textStyle.italic ? 'italic' : 'normal'};
  --vn-text-color:${payload.textStyle.textColor};
  --vn-box-bg:${payload.textStyle.boxBgColor};
}
*{box-sizing:border-box;}
html,body{margin:0;height:100%;background:#0b0b0d;color:#f2f2f2;font-family:Arial,"Microsoft JhengHei",sans-serif;}
#app{position:fixed;inset:0;display:flex;flex-direction:column;}
.topbar{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:8px 14px;background:#161618;border-bottom:1px solid #2a2a2e;font-size:13px;color:#9a9aa2;font-family:"Courier New",monospace;}
.stage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;background:#111114 radial-gradient(ellipse at 50% 30%, #1c1c22 0%, #0c0c0f 70%);display:flex;align-items:flex-end;justify-content:center;cursor:pointer;user-select:none;}
.stage-bg{position:absolute;inset:0;background-size:cover;background-position:center;transition:opacity .25s ease;opacity:0;}
.stage-bg.on{opacity:1;}
.portrait-slot{position:absolute;bottom:0;height:82%;width:34%;display:flex;align-items:flex-end;justify-content:center;pointer-events:none;opacity:0;transition:opacity .18s ease, transform .18s ease, filter .18s ease;filter:brightness(.55) saturate(.7);transform-origin:bottom center;}
.portrait-slot img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 10px 24px rgba(0,0,0,.55));}
.portrait-slot.active{opacity:1;filter:brightness(1) saturate(1);}
.stage-illust{position:absolute;top:45%;left:50%;transform:translate(-50%, -50%) scale(0.92);z-index:3;pointer-events:none;opacity:0;transition:opacity 0.22s ease, transform 0.22s ease;max-width:80%;max-height:55%;display:flex;align-items:center;justify-content:center;}
.stage-illust.active{opacity:1;transform:translate(-50%, -50%) scale(1);}
.stage-illust img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 12px 32px rgba(0,0,0,0.8));border-radius:8px;}
.vn-box{position:relative;z-index:4;width:min(1000px,92%);margin:0 0 26px;border:1px solid #3a3a44;border-radius:12px;padding:16px 22px 20px;backdrop-filter:blur(3px);min-height:112px;box-shadow:0 12px 32px rgba(0,0,0,.5);}
.vn-name{display:inline-block;font-weight:700;font-size:15px;padding:3px 14px;border-radius:20px;margin-bottom:8px;background:var(--vn-name-color,#800020);color:#fff;}
.vn-box.narration .vn-name{display:none;}
.vn-text{font-family:var(--vn-font-family);font-size:var(--vn-font-size);font-weight:var(--vn-font-weight);font-style:var(--vn-font-style);color:var(--vn-text-color);line-height:1.75;white-space:pre-wrap;word-break:break-word;min-height:2.6em;}
.vn-progress{position:absolute;right:16px;bottom:10px;font-family:"Courier New",monospace;font-size:11px;color:#8a8a92;}
.vn-continue-cue{position:absolute;right:20px;bottom:34px;font-size:11px;color:#8a8a92;animation:vnBlink 1.2s infinite;}
@keyframes vnBlink{0%,100%{opacity:.25;}50%{opacity:1;}}
.controlbar{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:8px 14px;background:#161618;border-top:1px solid #2a2a2e;flex-wrap:wrap;}
.btn{border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;background:transparent;color:#c9c9d1;border:1px solid #3a3a40;}
.btn:hover{color:#fff;border-color:#7a7a90;}
.btn.autoplay-on{color:var(--accent-2);border-color:var(--accent-2);}
.hint{font-size:11.5px;color:#7a7a82;margin-left:auto;}
</style>
</head>
<body>
<div id="app">
  <div class="topbar">RPG Replay Player</div>
  <div class="stage" id="stage">
    <div class="stage-bg" id="stageBg"></div>
    <div class="portrait-slot" id="portraitLeft"><img id="portraitLeftImg" alt=""></div>
    <div class="portrait-slot" id="portraitCenter"><img id="portraitCenterImg" alt=""></div>
    <div class="portrait-slot" id="portraitRight"><img id="portraitRightImg" alt=""></div>
    <div class="stage-illust" id="stageIllust"><img id="stageIllustImg" alt=""></div>
    <div class="vn-box" id="vnBox">
      <div class="vn-name" id="vnName"></div>
      <div class="vn-text" id="vnText"></div>
      <span class="vn-continue-cue">click / space ▸</span>
      <div class="vn-progress" id="vnProgress">0 / 0</div>
    </div>
  </div>
  <div class="controlbar">
    <button class="btn" id="prevBtn" type="button">◀ 上一句</button>
    <button class="btn" id="nextBtn" type="button">下一句 ▶</button>
    <button class="btn" id="autoBtn" type="button">自動播放</button>
    <button class="btn" id="restartBtn" type="button">⟲ 從頭開始</button>
    <span class="hint">空白鍵/Enter/→ 繼續 ←上一句</span>
  </div>
  <audio id="bgmAudio" loop></audio>
</div>
<script>
(function(){
  const DATA = ${json};
  const state = { index:0, typing:false, typeTimer:null, autoPlay:false, autoTimer:null, currentBgmKey:null };
  function $(id){ return document.getElementById(id); }
  function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
  function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function repeatSuffix(l){ return (l.count && l.count > 1) ? ' (x' + l.count + ')' : ''; }

  const boxBg = DATA.textStyle ? DATA.textStyle.boxBgColor : '#0e0e11';
  const boxOp = DATA.textStyle ? DATA.textStyle.boxOpacity : 0.86;
  const r = parseInt(boxBg.slice(1,3), 16) || 14;
  const g = parseInt(boxBg.slice(3,5), 16) || 14;
  const b = parseInt(boxBg.slice(5,7), 16) || 17;
  $('vnBox').style.background = "rgba(" + r + "," + g + "," + b + "," + boxOp + ")";

  function parseFormattedTokens(text) {
    const regex = /\\[(\\/?)(b|i|color|bg|size)(?:=([^\\]]+))?\\]/gi;
    const stack = [];
    const tokens = [];
    let lastIndex = 0;
    let m;
    function getActiveStyle() {
      const st = {};
      for (let j = 0; j < stack.length; j++) {
        const item = stack[j];
        if (item.tag === 'b') st.bold = true;
        else if (item.tag === 'i') st.italic = true;
        else if (item.tag === 'color') st.color = item.val;
        else if (item.tag === 'bg') st.bg = item.val;
        else if (item.tag === 'size') st.size = item.val;
      }
      return st;
    }
    while ((m = regex.exec(text)) !== null) {
      const plain = text.slice(lastIndex, m.index);
      if (plain) {
        const currentStyle = getActiveStyle();
        for (let j = 0; j < plain.length; j++) tokens.push({ char: plain[j], style: currentStyle });
      }
      const isClosing = m[1] === '/';
      const tag = m[2].toLowerCase();
      const val = m[3];
      if (isClosing) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tag) { stack.splice(i, 1); break; }
        }
      } else {
        stack.push({ tag: tag, val: val });
      }
      lastIndex = regex.lastIndex;
    }
    const tail = text.slice(lastIndex);
    if (tail) {
      const currentStyle = getActiveStyle();
      for (let j = 0; j < tail.length; j++) tokens.push({ char: tail[j], style: currentStyle });
    }
    return tokens;
  }

  function tokensToHtml(tokens) {
    if (!tokens || !tokens.length) return '';
    let html = '';
    function isSameStyle(s1, s2) {
      if (!s1 || !s2) return s1 === s2;
      return s1.bold === s2.bold && s1.italic === s2.italic && s1.color === s2.color && s1.bg === s2.bg && s1.size === s2.size;
    }
    function buildStyleAttr(st) {
      if (!st) return '';
      const styles = [];
      if (st.bold) styles.push('font-weight:bold');
      if (st.italic) styles.push('font-style:italic');
      if (st.color) styles.push('color:' + escapeHtml(st.color));
      if (st.bg) styles.push('background-color:' + escapeHtml(st.bg) + ';border-radius:3px;padding:0 2px');
      if (st.size) {
        const s = /^\\d+$/.test(st.size) ? st.size + 'px' : st.size;
        styles.push('font-size:' + escapeHtml(s));
      }
      return styles.length ? ' style="' + styles.join(';') + '"' : '';
    }
    let chunkText = '';
    let chunkStyle = null;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (i === 0) {
        chunkText = t.char; chunkStyle = t.style;
      } else if (isSameStyle(t.style, chunkStyle)) {
        chunkText += t.char;
      } else {
        const attr = buildStyleAttr(chunkStyle);
        html += attr ? '<span' + attr + '>' + escapeHtml(chunkText) + '</span>' : escapeHtml(chunkText);
        chunkText = t.char; chunkStyle = t.style;
      }
    }
    if (chunkText) {
      const attr = buildStyleAttr(chunkStyle);
      html += attr ? '<span' + attr + '>' + escapeHtml(chunkText) + '</span>' : escapeHtml(chunkText);
    }
    return html;
  }

  function actionDisplayText(line){
    if(line.type !== 'action' || !line.player) return line.text;
    const sp = DATA.speakers[line.player];
    if(!sp || sp.displayName === line.player) return line.text;
    const name = line.player;
    const text = line.text;
    const prefixes = ['* ' + name + ' ', '* ' + name + '\\u3000'];
    for(let i=0;i<prefixes.length;i++){
      const p = prefixes[i];
      if(text.indexOf(p) === 0) return '* ' + sp.displayName + ' ' + text.slice(p.length);
    }
    if(text === '* ' + name) return '* ' + sp.displayName;
    return text;
  }
  function displayTextFor(line){ return line.type === 'action' ? actionDisplayText(line) : line.text; }

  function getEffectiveBgm(idx){
    for(let i = idx; i >= 0; i--){
      const l = DATA.script[i];
      const ov = DATA.overrides[l.key];
      if(ov){
        if(ov.bgmAction === 'stop') return null;
        if(ov.bgmAction === 'set' && ov.bgm) return { key: 'line_' + i, url: ov.bgm };
      }
    }
    return DATA.defaultBgm ? { key: 'default', url: DATA.defaultBgm } : null;
  }

  function updateBgm(idx){
    const eff = getEffectiveBgm(idx);
    const audio = $('bgmAudio');
    if(!eff){
      if(state.currentBgmKey !== null){ audio.pause(); audio.removeAttribute('src'); state.currentBgmKey = null; }
      return;
    }
    if(state.currentBgmKey !== eff.key){
      state.currentBgmKey = eff.key;
      audio.src = eff.url;
      audio.volume = DATA.bgmVolume != null ? DATA.bgmVolume : 0.6;
      audio.loop = true;
      audio.play().catch(function(){});
    }
  }

  function resolvePortrait(sp, ov){
    if(!sp || !sp.portraits || sp.portraits.length === 0) return null;
    if(ov && ov.portraitIdx !== undefined && ov.portraitIdx !== null && sp.portraits[ov.portraitIdx]){
      return sp.portraits[ov.portraitIdx].data;
    }
    const defIdx = sp.defaultPortraitIdx || 0;
    return sp.portraits[defIdx] ? sp.portraits[defIdx].data : sp.portraits[0].data;
  }

  function applyTransform(slot, sp){
    const scale = sp.scale || 1;
    const offX = sp.offsetX || 0;
    const offY = sp.offsetY || 0;
    if(sp.position === 'center'){
      slot.style.left = "calc(50% + " + offX + "px)";
      slot.style.right = 'auto';
      slot.style.transform = "translateX(-50%) translateY(" + offY + "px) scale(" + scale + ")";
    } else if(sp.position === 'left'){
      slot.style.left = "calc(2% + " + offX + "px)";
      slot.style.right = 'auto';
      slot.style.transform = "translateY(" + offY + "px) scale(" + scale + ")";
    } else {
      slot.style.left = 'auto';
      slot.style.right = "calc(2% - " + offX + "px)";
      slot.style.transform = "translateY(" + offY + "px) scale(" + scale + ")";
    }
  }

  function showLine(idx, redrawOnly){
    if(idx < 0 || idx >= DATA.script.length) return;
    state.index = idx;
    if(state.autoTimer){ clearTimeout(state.autoTimer); state.autoTimer = null; }

    const line = DATA.script[idx];
    const ov = DATA.overrides[line.key] || {};
    $('vnProgress').textContent = (idx+1) + ' / ' + DATA.script.length;

    ['Left','Center','Right'].forEach(function(pos){
      const slot = $('portrait' + pos);
      slot.classList.remove('active');
      slot.style.left = ''; slot.style.right = ''; slot.style.transform = '';
    });

    const bgURL = ov.bg || DATA.defaultBg || null;
    const stageBg = $('stageBg');
    if(bgURL){ stageBg.style.backgroundImage = "url('" + bgURL + "')"; stageBg.classList.add('on'); }
    else { stageBg.classList.remove('on'); stageBg.style.backgroundImage = ''; }

    const illustBox = $('stageIllust');
    const illustImg = $('stageIllustImg');
    if(ov.illust){ illustImg.src = ov.illust; illustBox.classList.add('active'); }
    else { illustBox.classList.remove('active'); illustImg.removeAttribute('src'); }

    updateBgm(idx);

    const vnBox = $('vnBox');
    const sp = line.player ? DATA.speakers[line.player] : null;
    if(line.type === 'chat'){
      vnBox.classList.remove('narration');
      $('vnName').textContent = sp ? sp.displayName : (line.player || '未知角色');
      vnBox.style.setProperty('--vn-name-color', sp ? sp.color : '#800020');
      const img = resolvePortrait(sp, ov);
      const posKey = capitalize(sp ? sp.position : 'center');
      const slot = $('portrait' + posKey);
      if(img){ $('portrait' + posKey + 'Img').src = img; applyTransform(slot, sp); slot.classList.add('active'); }
    } else {
      vnBox.classList.add('narration');
      $('vnName').textContent = '';
      const img = resolvePortrait(sp, ov);
      if(sp && img){
        const posKey = capitalize(sp.position);
        const slot = $('portrait' + posKey);
        $('portrait' + posKey + 'Img').src = img;
        applyTransform(slot, sp);
        slot.classList.add('active');
      }
    }

    if(!redrawOnly && ov.sfx){
      const sfx = new Audio(ov.sfx);
      sfx.volume = 0.9;
      sfx.play().catch(function(){});
    }
    if(redrawOnly) return;

    if(state.typeTimer){ clearInterval(state.typeTimer); state.typeTimer = null; }
    const textEl = $('vnText');
    const full = displayTextFor(line) + repeatSuffix(line);
    const tokens = parseFormattedTokens(full);
    textEl.innerHTML = '';
    let i = 0;
    state.typing = true;
    state.typeTimer = setInterval(function(){
      i++;
      textEl.innerHTML = tokensToHtml(tokens.slice(0, i));
      if(i >= tokens.length){
        clearInterval(state.typeTimer); state.typeTimer = null; state.typing = false;
        onFullyShown();
      }
    }, Math.max(6, DATA.typeSpeed || 28));
  }

  function completeTyping(){
    if(!state.typing) return;
    clearInterval(state.typeTimer); state.typeTimer = null; state.typing = false;
    const line = DATA.script[state.index];
    const full = displayTextFor(line) + repeatSuffix(line);
    const tokens = parseFormattedTokens(full);
    $('vnText').innerHTML = tokensToHtml(tokens);
    onFullyShown();
  }

  function onFullyShown(){
    if(state.autoPlay){
      state.autoTimer = setTimeout(function(){ if(!nextLine()) setAutoPlay(false); }, DATA.autoDelay || 1200);
    }
  }

  function nextLine(){ if(state.index >= DATA.script.length - 1) return false; showLine(state.index+1, false); return true; }
  function prevLine(){ if(state.index <= 0) return false; showLine(state.index-1, false); return true; }
  function advance(){ if(state.typing){ completeTyping(); } else { nextLine(); } }
  function setAutoPlay(on){
    state.autoPlay = on;
    const btn = $('autoBtn');
    btn.classList.toggle('autoplay-on', on);
    btn.textContent = on ? '自動播放中' : '自動播放';
    if(state.autoTimer){ clearTimeout(state.autoTimer); state.autoTimer = null; }
    if(on && !state.typing) onFullyShown();
  }

  $('stage').addEventListener('click', advance);
  $('prevBtn').addEventListener('click', function(){ setAutoPlay(false); prevLine(); });
  $('nextBtn').addEventListener('click', function(){ setAutoPlay(false); advance(); });
  $('autoBtn').addEventListener('click', function(){ setAutoPlay(!state.autoPlay); });
  $('restartBtn').addEventListener('click', function(){ setAutoPlay(false); showLine(0, false); });
  document.addEventListener('keydown', function(e){
    if(e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight'){ e.preventDefault(); advance(); }
    else if(e.key === 'ArrowLeft'){ setAutoPlay(false); prevLine(); }
  });

  const tryPlay = function(){ updateBgm(0); document.removeEventListener('click', tryPlay); };
  document.addEventListener('click', tryPlay);

  if(DATA.script.length){ showLine(0, false); }
})();
</script>
</body>
</html>`;
  }

  async function exportStandaloneHtml() {
    const btn = $('exportHtmlBtn');
    if (!state.script.length) {
      alert('目前沒有可匯出的內容');
      return;
    }
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '匯出中（素材較多可能要等一下）';
    try {
      const payload = await buildExportPayload();
      const html = buildStandaloneHtml(payload);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vn_playback.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('匯出失敗：' + (err && err.message ? err.message : err));
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  function dataURLtoFile(dataURL, filename) {
    if (!dataURL) return null;
    const commaIdx = dataURL.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataURL.slice(0, commaIdx);
    const base64 = dataURL.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : '';
    let bin;
    try { bin = atob(base64); } catch (err) { return null; }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  }

  function parseExportedHtmlData(text) {
    const m = text.match(/const DATA = ([\s\S]*?);\s*const state = \{/);
    if (!m) throw new Error('找不到可匯入的資料，這個檔案可能不是本工具匯出的。');
    try { return JSON.parse(m[1]); } catch (err) { throw new Error('資料格式錯誤，無法解析。'); }
  }

  function loadStateFromExportedData(data) {
    state.script = (data.script || []).map(l => ({
      type: l.type, player: l.player, text: l.text, count: l.count,
      key: l.key || lineKey(l),
    }));

    state.speakers = {};
    Object.keys(data.speakers || {}).forEach(name => {
      const sp = data.speakers[name] || {};
      const ports = (sp.portraits || []).map(p => {
        const file = dataURLtoFile(p.data, p.name);
        return { name: p.name, file, url: p.data };
      });
      state.speakers[name] = {
        name,
        displayName: sp.displayName || name,
        color: sp.color || colorForSpeaker(name),
        portraits: ports,
        defaultPortraitIdx: sp.defaultPortraitIdx || 0,
        position: sp.position || 'center',
        scale: sp.scale || 1,
        offsetX: sp.offsetX || 0,
        offsetY: sp.offsetY || 0
      };
    });

    state.script.forEach(line => { if (line.player) ensureSpeaker(line.player); });

    state.lineOverrides = {};
    Object.keys(data.overrides || {}).forEach(key => {
      const ov = data.overrides[key] || {};
      const out = {};
      if (ov.portraitIdx !== undefined && ov.portraitIdx !== null) out.portraitIdx = ov.portraitIdx;
      if (ov.bg) { const f = dataURLtoFile(ov.bg, 'line_bg'); out.bgURL = ov.bg; out.bgFile = f; out.bgName = f ? f.name : ''; }
      if (ov.illust) { const f = dataURLtoFile(ov.illust, 'line_illust'); out.illustURL = ov.illust; out.illustFile = f; out.illustName = f ? f.name : ''; }
      if (ov.sfx) { const f = dataURLtoFile(ov.sfx, 'line_sfx'); out.sfxURL = ov.sfx; out.sfxFile = f; out.sfxName = f ? f.name : ''; }
      if (ov.bgmAction) {
        out.bgmAction = ov.bgmAction;
        if (ov.bgm) { const f = dataURLtoFile(ov.bgm, 'line_bgm'); out.bgmURL = ov.bgm; out.bgmFile = f; out.bgmName = f ? f.name : ''; }
      }
      if (Object.keys(out).length) state.lineOverrides[key] = out;
    });

    state.defaultBgURL = data.defaultBg || null;
    state.defaultBgFile = data.defaultBg ? dataURLtoFile(data.defaultBg, 'default_bg') : null;
    state.defaultBgName = state.defaultBgFile ? state.defaultBgFile.name : (data.defaultBg ? '（已匯入背景）' : '');

    state.defaultBgmURL = data.defaultBgm || null;
    state.defaultBgmFile = data.defaultBgm ? dataURLtoFile(data.defaultBgm, 'default_bgm') : null;
    state.defaultBgmName = state.defaultBgmFile ? state.defaultBgmFile.name : (data.defaultBgm ? '（已匯入BGM）' : '');

    state.bgmVolume = (data.bgmVolume != null) ? data.bgmVolume : 0.6;
    state.typeSpeed = data.typeSpeed || 28;
    state.autoDelay = data.autoDelay || 1200;
    if (data.textStyle) state.textStyle = Object.assign({}, state.textStyle, data.textStyle);
  }

  function syncSettingsPanelFromState() {
    $('defaultBgFileName').textContent = state.defaultBgName || (state.defaultBgURL ? '（已匯入背景）' : '尚未匯入');
    $('bgmFileName').textContent = state.defaultBgmName || (state.defaultBgmURL ? '（已匯入BGM）' : '尚未匯入');
    $('bgmVolume').value = state.bgmVolume;
    $('bgmVolumeVal').textContent = Math.round(state.bgmVolume * 100) + '%';
    $('typeSpeedRange').value = state.typeSpeed;
    $('typeSpeedVal').textContent = state.typeSpeed + ' ms/字';
    $('autoDelayRange').value = state.autoDelay;
    $('autoDelayVal').textContent = (state.autoDelay / 1000).toFixed(1) + ' 秒';

    $('fontFamilySelect').value = state.textStyle.fontFamily;
    $('fontSizeRange').value = state.textStyle.fontSize;
    $('fontSizeVal').textContent = state.textStyle.fontSize + 'px';
    $('fontBoldCheck').checked = state.textStyle.bold;
    $('fontItalicCheck').checked = state.textStyle.italic;
    $('textColorInput').value = state.textStyle.textColor;
    $('boxBgColorInput').value = state.textStyle.boxBgColor;
    $('boxOpacityRange').value = state.textStyle.boxOpacity;
    $('boxOpacityVal').textContent = Math.round(state.textStyle.boxOpacity * 100) + '%';
    applyTextStyle();
  }

  async function importExportedHtmlFile(file) {
    try {
      const text = await file.text();
      const data = parseExportedHtmlData(text);
      loadStateFromExportedData(data);
      openPlayerUI();
      syncSettingsPanelFromState();
    } catch (err) {
      alert('匯入失敗：' + (err && err.message ? err.message : err));
    }
  }

  $('playBtn').addEventListener('click', openPlayer);
  $('importPlayInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    importExportedHtmlFile(file);
    e.target.value = '';
  });

  $('exitPlayerBtn').addEventListener('click', closePlayer);
  $('vnClickCatcher').addEventListener('click', handleAdvance);

  $('prevLineBtn').addEventListener('click', () => { setAutoPlay(false); prevLine(); });
  $('nextLineBtn').addEventListener('click', () => { setAutoPlay(false); handleAdvance(); });
  $('autoPlayBtn').addEventListener('click', () => { setAutoPlay(!state.autoPlay); });
  $('restartPlayBtn').addEventListener('click', () => { setAutoPlay(false); showLine(0, { resetTyping: true }); });
  $('exportHtmlBtn').addEventListener('click', exportStandaloneHtml);

  $('togglePanelBtn').addEventListener('click', () => {
    $('playerPanel').hidden = !$('playerPanel').hidden;
  });

  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $(tab.getAttribute('data-pane')).classList.add('active');
    });
  });

  $('fontFamilySelect').addEventListener('change', e => {
    state.textStyle.fontFamily = e.target.value;
    applyTextStyle();
  });
  $('fontSizeRange').addEventListener('input', e => {
    state.textStyle.fontSize = parseInt(e.target.value, 10);
    $('fontSizeVal').textContent = state.textStyle.fontSize + 'px';
    applyTextStyle();
  });
  $('fontBoldCheck').addEventListener('change', e => {
    state.textStyle.bold = e.target.checked;
    applyTextStyle();
  });
  $('fontItalicCheck').addEventListener('change', e => {
    state.textStyle.italic = e.target.checked;
    applyTextStyle();
  });
  $('textColorInput').addEventListener('input', e => {
    state.textStyle.textColor = e.target.value;
    applyTextStyle();
  });
  $('boxBgColorInput').addEventListener('input', e => {
    state.textStyle.boxBgColor = e.target.value;
    applyTextStyle();
  });
  $('boxOpacityRange').addEventListener('input', e => {
    state.textStyle.boxOpacity = parseFloat(e.target.value);
    $('boxOpacityVal').textContent = Math.round(state.textStyle.boxOpacity * 100) + '%';
    applyTextStyle();
  });

  $('defaultBgInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    state.defaultBgURL = URL.createObjectURL(file);
    state.defaultBgFile = file;
    state.defaultBgName = file.name;
    $('defaultBgFileName').textContent = file.name;
    showLine(state.index, { resetTyping: false, redrawOnly: true });
  });
  $('defaultBgClearBtn').addEventListener('click', () => {
    state.defaultBgURL = null;
    state.defaultBgFile = null;
    state.defaultBgName = '';
    $('defaultBgFileName').textContent = '尚未匯入';
    showLine(state.index, { resetTyping: false, redrawOnly: true });
  });

  $('bgmInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    state.defaultBgmURL = URL.createObjectURL(file);
    state.defaultBgmFile = file;
    state.defaultBgmName = file.name;
    $('bgmFileName').textContent = file.name;
    updateBgmForLine(state.index);
  });
  $('bgmVolume').addEventListener('input', e => {
    state.bgmVolume = parseFloat(e.target.value);
    $('bgmAudio').volume = state.bgmVolume;
    $('bgmVolumeVal').textContent = Math.round(state.bgmVolume * 100) + '%';
  });
  $('bgmStopBtn').addEventListener('click', () => {
    const audio = $('bgmAudio');
    audio.pause();
    state.currentBgmKey = null;
  });

  $('typeSpeedRange').addEventListener('input', e => {
    state.typeSpeed = parseInt(e.target.value, 10);
    $('typeSpeedVal').textContent = state.typeSpeed + ' ms/字';
  });
  $('autoDelayRange').addEventListener('input', e => {
    state.autoDelay = parseInt(e.target.value, 10);
    $('autoDelayVal').textContent = (state.autoDelay / 1000).toFixed(1) + ' 秒';
  });
  $('clearOverridesBtn').addEventListener('click', () => {
    if (!confirm('確定要清除所有單句指定的差分設定嗎？')) return;
    state.lineOverrides = {};
    renderLinePanel();
    showLine(state.index, { resetTyping: false, redrawOnly: true });
  });

  document.addEventListener('keydown', e => {
    if ($('playerView').hidden) return;
    const tag = e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      handleAdvance();
    } else if (e.key === 'ArrowLeft') {
      setAutoPlay(false);
      prevLine();
    } else if (e.key === 'Escape') {
      closePlayer();
    }
  });

})();