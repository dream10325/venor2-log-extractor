(function () {

  const COLOR_PALETTE = [
    '#800020', '#1d5fae', '#2e7d32', '#8e44ad', '#c2740c',
    '#0b7285', '#a12f5e', '#5d4037', '#37474f', '#6a1b9a'
  ];

  const AUTO_READ_MS_PER_CHAR = 45;
  const AUTO_READ_MAX_EXTRA = 6000;

  function autoAdvanceDelay(charCount) {
    return state.autoDelay + Math.min(AUTO_READ_MAX_EXTRA, (charCount || 0) * AUTO_READ_MS_PER_CHAR);
  }

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
    currentLineCharCount: 0,
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

  function $(id) { return document.getElementById(id); }

  function lineKey(e, idx) {
    return `line_${idx}`;
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

  function getSourceEntries() {
    const lastFiltered = ExtractorModule.getLastFiltered();
    if (lastFiltered.length) return lastFiltered;
    const entries = ExtractorModule.getEntries();
    if (entries.length) {
      return ExtractorModule.runFilterAndRender();
    }
    return [];
  }

  function buildScript(src) {
    state.script = src.map((e, i) => ({
      type: e.type,
      player: e.player,
      text: e.text,
      count: e.count,
      key: lineKey(e, i),
    }));
    state.script.forEach(line => {
      if (line.player) ensureSpeaker(line.player);
    });
  }

  function clearTyping() {
    if (state.typeTimer) { clearInterval(state.typeTimer); state.typeTimer = null; }
    state.typing = false;
  }

  function clearAutoTimer() {
    if (state.autoTimer) { clearTimeout(state.autoTimer); state.autoTimer = null; }
  }

  function showLine(idx, opts) {
    opts = opts || {};
    if (idx < 0 || idx >= state.script.length) return;
    state.index = idx;
    clearAutoTimer();

    const line = state.script[idx];
    const ov = state.lineOverrides[line.key] || {};
    const sp = line.player ? (state.speakers[line.player] || ensureSpeaker(line.player)) : null;

    $('vnProgress').textContent = `${idx + 1} / ${state.script.length}`;
    EditorModule.highlightCurrentLineRow(idx);

    const effectiveBgURL = StageModule.resolveBackgroundURL(idx, state.script, state.lineOverrides, state.defaultBgURL);
    StageModule.renderStage(line, ov, sp, effectiveBgURL, state.speakers);
    AudioModule.updateBgmForLine(idx, state);

    if (!opts.redrawOnly && ov.sfxURL) {
      AudioModule.playSfx(ov.sfxURL, ov.sfxVolume);
    }

    if (opts.redrawOnly) return;

    clearTyping();
    const textEl = $('vnText');
    const full = StageModule.displayTextFor(line, state.speakers) + StageModule.repeatSuffixSafe(line);
    const tokens = BBCodeModule.parseFormattedTokens(full);
    state.currentLineCharCount = tokens.length;
    textEl.innerHTML = '';
    let i = 0;
    state.typing = true;
    state.typeTimer = setInterval(() => {
      i++;
      textEl.innerHTML = BBCodeModule.tokensToHtml(tokens.slice(0, i));
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
    const full = StageModule.displayTextFor(line, state.speakers) + StageModule.repeatSuffixSafe(line);
    const tokens = BBCodeModule.parseFormattedTokens(full);
    $('vnText').innerHTML = BBCodeModule.tokensToHtml(tokens);
    onLineFullyShown();
  }

  function onLineFullyShown() {
    if (state.autoPlay) {
      state.autoTimer = setTimeout(() => {
        if (!nextLine()) setAutoPlay(false);
      }, autoAdvanceDelay(state.currentLineCharCount));
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
    refreshImmersiveMode();
  }

  function editorCallbacks() {
    return {
      onRedraw: () => showLine(state.index, { resetTyping: false, redrawOnly: true }),
      onUpdateLines: () => EditorModule.renderLinePanel(state, editorCallbacks()),
      onSelectLine: (idx) => {
        setAutoPlay(false);
        showLine(idx, { resetTyping: true });
      },
      onCurrentLineTextChange: () => {
        clearTyping();
        const full = StageModule.displayTextFor(state.script[state.index], state.speakers) + StageModule.repeatSuffixSafe(state.script[state.index]);
        $('vnText').innerHTML = BBCodeModule.tokensToHtml(BBCodeModule.parseFormattedTokens(full));
      },
      onBgmChange: (idx) => AudioModule.updateBgmForLine(idx, state),
      onDeleteLine: (idx) => {
        if (state.script.length <= 1) {
          alert('至少需保留一句對話');
          return;
        }
        if (!confirm(`確定要刪除第 ${idx + 1} 句嗎？`)) return;
        state.script.splice(idx, 1);
        if (state.index >= state.script.length) state.index = state.script.length - 1;
        EditorModule.renderLinePanel(state, editorCallbacks());
        showLine(state.index, { resetTyping: true });
      },
      onInsertLine: (idx, isBelow) => {
        const insertIdx = isBelow ? idx + 1 : idx;
        const newLine = {
          type: 'action',
          player: null,
          text: '（請在此輸入對話或動作）',
          count: 1,
          key: 'custom_' + Date.now() + '_' + Math.random()
        };
        state.script.splice(insertIdx, 0, newLine);
        if (isBelow && state.index >= insertIdx) state.index++;
        EditorModule.renderLinePanel(state, editorCallbacks());
        showLine(insertIdx, { resetTyping: true });
      },
      onReorder: (fromIdx, toIdx, insertAfter) => {
        const item = state.script.splice(fromIdx, 1)[0];
        let targetPos = toIdx;
        if (fromIdx < toIdx) {
          targetPos = insertAfter ? toIdx : toIdx - 1;
        } else {
          targetPos = insertAfter ? toIdx + 1 : toIdx;
        }
        targetPos = Math.max(0, Math.min(state.script.length, targetPos));
        state.script.splice(targetPos, 0, item);
        state.index = targetPos;
        EditorModule.renderLinePanel(state, editorCallbacks());
        showLine(state.index, { resetTyping: true });
      }
    };
  }

  function syncSettingsPanelFromState() {
    $('defaultBgFileName').textContent = state.defaultBgName || (state.defaultBgURL ? '（已匯入背景）' : '尚未匯入');
    $('bgmFileName').textContent = state.defaultBgmName || (state.defaultBgmURL ? '（已匯入BGM）' : '尚未匯入');
    $('bgmVolume').value = state.bgmVolume;
    $('bgmVolumeVal').textContent = Math.round(state.bgmVolume * 100) + '%';
    if ($('sfxGlobalVolume')) {
      $('sfxGlobalVolume').value = AudioModule.getGlobalSfxVolume();
      $('sfxGlobalVolumeVal').textContent = Math.round(AudioModule.getGlobalSfxVolume() * 100) + '%';
    }
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
    StageModule.applyTextStyle(state.textStyle);
  }

  function openPlayerUI() {
    state.index = 0;
    state.currentBgmKey = null;
    StageModule.resetStageSlots();
    EditorModule.clearHistory();
    StageModule.applyTextStyle(state.textStyle);
    EditorModule.renderSpeakerPanel(state, editorCallbacks());
    EditorModule.renderLinePanel(state, editorCallbacks());
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
    if (!confirm('即將離開播放器，所有未匯出的編輯進度將會遺失。確定要返回嗎？')) return;
    setAutoPlay(false);
    clearTyping();
    StageModule.resetStageSlots();
    AudioModule.stopBgm(state);
    $('playerView').hidden = true;
    document.body.style.overflow = '';
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
      const payload = await ExportModule.buildExportPayload(state);
      const html = await ExportModule.buildStandaloneHtml(payload);
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

  async function importExportedHtmlFile(file) {
    try {
      const text = await file.text();
      const data = ExportModule.parseExportedHtmlData(text);
      ExportModule.loadStateFromExportedData(data, state, ensureSpeaker, colorForSpeaker);
      openPlayerUI();
      syncSettingsPanelFromState();
    } catch (err) {
      alert('匯入失敗：' + (err && err.message ? err.message : err));
    }
  }

  window.addEventListener('beforeunload', e => {
    if (!$('playerView').hidden && state.script.length > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  $('playBtn').addEventListener('click', openPlayer);
  $('importPlayInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    importExportedHtmlFile(file);
    e.target.value = '';
  });

  $('exitPlayerBtn').addEventListener('click', closePlayer);
  $('vnClickCatcher').addEventListener('click', () => { hideImmersiveControlsNow(); handleAdvance(); });

  $('prevLineBtn').addEventListener('click', () => { hideImmersiveControlsNow(); setAutoPlay(false); prevLine(); });
  $('nextLineBtn').addEventListener('click', () => { hideImmersiveControlsNow(); setAutoPlay(false); handleAdvance(); });
  $('autoPlayBtn').addEventListener('click', () => { setAutoPlay(!state.autoPlay); });
  $('restartPlayBtn').addEventListener('click', () => {
    hideImmersiveControlsNow();
    setAutoPlay(false);
    StageModule.resetStageSlots();
    showLine(0, { resetTyping: true });
  });
  $('exportHtmlBtn').addEventListener('click', exportStandaloneHtml);

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  }

  function toggleFullscreen() {
    const el = $('playerView');
    if (!isFullscreen()) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (req) req.call(el);
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (exit) exit.call(document);
    }
  }

  function updateFullscreenBtn() {
    const btn = $('fullscreenBtn');
    if (btn) btn.textContent = isFullscreen() ? '⛶ 退出全螢幕' : '⛶ 全螢幕';
    refreshImmersiveMode();
  }

  $('fullscreenBtn').addEventListener('click', toggleFullscreen);
  ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(evt => {
    document.addEventListener(evt, updateFullscreenBtn);
  });

  let immersiveIdleTimer = null;
  const IMMERSIVE_IDLE_DELAY = 2200;

  function clearImmersiveIdleTimer() {
    if (immersiveIdleTimer) { clearTimeout(immersiveIdleTimer); immersiveIdleTimer = null; }
  }

  function scheduleImmersiveIdle() {
    clearImmersiveIdleTimer();
    immersiveIdleTimer = setTimeout(() => {
      $('playerView').classList.add('immersive-idle');
    }, IMMERSIVE_IDLE_DELAY);
  }

  function wakeImmersiveControls() {
    if (!$('playerView').classList.contains('immersive-mode')) return;
    $('playerView').classList.remove('immersive-idle');
    scheduleImmersiveIdle();
  }

  // Hides the bars right away, no idle wait. Used for anything that means
  // "advance / control the story" — clicks, key presses — as opposed to
  // mouse movement, which is the only thing allowed to reveal the bars.
  function hideImmersiveControlsNow() {
    if (!$('playerView').classList.contains('immersive-mode')) return;
    clearImmersiveIdleTimer();
    $('playerView').classList.add('immersive-idle');
  }

  // Entering immersive mode always starts hidden. The bars only ever get
  // revealed by moving the mouse (wakeImmersiveControls) or hovering them
  // directly (see mouseenter/mouseleave below) — never just by turning
  // immersive mode on via fullscreen/autoplay.
  function enterImmersiveMode() {
    $('playerView').classList.add('immersive-mode');
    hideImmersiveControlsNow();
  }

  function exitImmersiveMode() {
    $('playerView').classList.remove('immersive-mode', 'immersive-idle');
    clearImmersiveIdleTimer();
  }

  function refreshImmersiveMode() {
    if (isFullscreen() || state.autoPlay) {
      enterImmersiveMode();
    } else {
      exitImmersiveMode();
    }
  }

  function isInsideBars(target) {
    return !!(target && target.closest && target.closest('.player-topbar, .player-controlbar'));
  }

  $('playerView').addEventListener('mousemove', wakeImmersiveControls);
  $('playerView').addEventListener('mousedown', e => {
    if (isInsideBars(e.target)) return;
    hideImmersiveControlsNow();
  });
  $('playerView').addEventListener('keydown', e => {
    if (isInsideBars(e.target)) return;
    hideImmersiveControlsNow();
  });

  const fsTopbarEl = document.querySelector('.player-topbar');
  const fsControlbarEl = document.querySelector('.player-controlbar');
  [fsTopbarEl, fsControlbarEl].forEach(el => {
    if (!el) return;
    el.addEventListener('mouseenter', () => {
      if (!$('playerView').classList.contains('immersive-mode')) return;
      clearImmersiveIdleTimer();
      $('playerView').classList.remove('immersive-idle');
    });
    el.addEventListener('mouseleave', () => {
      if (!$('playerView').classList.contains('immersive-mode')) return;
      scheduleImmersiveIdle();
    });
  });

  $('togglePanelBtn').addEventListener('click', () => {
    $('playerPanel').hidden = !$('playerPanel').hidden;
  });

  document.querySelectorAll('.settings-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.settings-group');
      group.classList.toggle('open');
    });
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
    StageModule.applyTextStyle(state.textStyle);
  });
  $('fontSizeRange').addEventListener('input', e => {
    state.textStyle.fontSize = parseInt(e.target.value, 10);
    $('fontSizeVal').textContent = state.textStyle.fontSize + 'px';
    StageModule.applyTextStyle(state.textStyle);
  });
  $('fontBoldCheck').addEventListener('change', e => {
    state.textStyle.bold = e.target.checked;
    StageModule.applyTextStyle(state.textStyle);
  });
  $('fontItalicCheck').addEventListener('change', e => {
    state.textStyle.italic = e.target.checked;
    StageModule.applyTextStyle(state.textStyle);
  });
  $('textColorInput').addEventListener('input', e => {
    state.textStyle.textColor = e.target.value;
    StageModule.applyTextStyle(state.textStyle);
  });
  $('boxBgColorInput').addEventListener('input', e => {
    state.textStyle.boxBgColor = e.target.value;
    StageModule.applyTextStyle(state.textStyle);
  });
  $('boxOpacityRange').addEventListener('input', e => {
    state.textStyle.boxOpacity = parseFloat(e.target.value);
    $('boxOpacityVal').textContent = Math.round(state.textStyle.boxOpacity * 100) + '%';
    StageModule.applyTextStyle(state.textStyle);
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
    AudioModule.updateBgmForLine(state.index, state);
  });
  $('bgmVolume').addEventListener('input', e => {
    state.bgmVolume = parseFloat(e.target.value);
    $('bgmAudio').volume = state.bgmVolume;
    $('bgmVolumeVal').textContent = Math.round(state.bgmVolume * 100) + '%';
  });
  $('bgmStopBtn').addEventListener('click', () => {
    AudioModule.stopBgm(state);
  });

  if ($('sfxGlobalVolume')) {
    $('sfxGlobalVolume').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      AudioModule.setGlobalSfxVolume(v);
      $('sfxGlobalVolumeVal').textContent = Math.round(v * 100) + '%';
    });
  }

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
    EditorModule.renderLinePanel(state, editorCallbacks());
    showLine(state.index, { resetTyping: false, redrawOnly: true });
  });

  document.addEventListener('keydown', e => {
    if ($('playerView').hidden) return;
    const tag = e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    hideImmersiveControlsNow();
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      handleAdvance();
    } else if (e.key === 'ArrowLeft') {
      setAutoPlay(false);
      prevLine();
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    } else if (e.key === 'a' || e.key === 'A') {
      setAutoPlay(!state.autoPlay);
    } else if (e.key === 'Escape') {
      if (isFullscreen()) return;
      closePlayer();
    }
  });

})();