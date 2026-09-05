const ExportModule = (function () {

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('讀取檔案失敗：' + file.name));
      reader.readAsDataURL(file);
    });
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

  async function buildExportPayload(state) {
    const speakersOut = {};
    for (const name of Object.keys(state.speakers)) {
      const sp = state.speakers[name];
      const portsOut = [];
      for (const p of (sp.portraits || [])) {
        portsOut.push({
          name: p.name,
          url: p.file ? await fileToDataURL(p.file) : p.url,
          flip: !!p.flip
        });
      }
      speakersOut[name] = {
        name: sp.name || name,
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
      if (ov.speaker) out.speaker = ov.speaker;
      if (ov.portraitIdx !== undefined && ov.portraitIdx !== null) out.portraitIdx = ov.portraitIdx;
      if (ov.flip !== undefined) out.flip = ov.flip;
      if (ov.bgFile) out.bgURL = await fileToDataURL(ov.bgFile);
      else if (ov.bgURL && ov.bgURL.startsWith('data:')) out.bgURL = ov.bgURL;
      if (ov.illustFile) out.illustURL = await fileToDataURL(ov.illustFile);
      else if (ov.illustURL && ov.illustURL.startsWith('data:')) out.illustURL = ov.illustURL;
      if (ov.sfxFile) out.sfxURL = await fileToDataURL(ov.sfxFile);
      else if (ov.sfxURL && ov.sfxURL.startsWith('data:')) out.sfxURL = ov.sfxURL;
      if (ov.sfxVolume !== undefined) out.sfxVolume = ov.sfxVolume;
      if (ov.bgmAction) {
        out.bgmAction = ov.bgmAction;
        if (ov.bgmFile) out.bgmURL = await fileToDataURL(ov.bgmFile);
        else if (ov.bgmURL && ov.bgmURL.startsWith('data:')) out.bgmURL = ov.bgmURL;
        if (out.bgmURL) out.bgmName = ov.bgmName || '';
      }
      if (Object.keys(out).length) overridesOut[key] = out;
    }

    return {
      script: state.script.map(l => ({ type: l.type, player: l.player, text: l.text, count: l.count, key: l.key })),
      speakers: speakersOut,
      overrides: overridesOut,
      defaultBgURL: state.defaultBgFile ? await fileToDataURL(state.defaultBgFile) : (state.defaultBgURL && state.defaultBgURL.startsWith('data:') ? state.defaultBgURL : null),
      defaultBgmURL: state.defaultBgmFile ? await fileToDataURL(state.defaultBgmFile) : (state.defaultBgmURL && state.defaultBgmURL.startsWith('data:') ? state.defaultBgmURL : null),
      defaultBgmName: state.defaultBgmName || '',
      bgmVolume: state.bgmVolume,
      sfxVolume: AudioModule.getGlobalSfxVolume(),
      typeSpeed: state.typeSpeed,
      autoDelay: state.autoDelay,
      textStyle: state.textStyle
    };
  }

  async function fetchModuleSource(path) {
    let res;
    try {
      res = await fetch(path);
    } catch (err) {
      throw new Error('無法讀取 ' + path + '（請以伺服器方式開啟本頁面，而非直接雙擊開啟本機檔案）');
    }
    if (!res.ok) throw new Error('無法讀取 ' + path + '（HTTP ' + res.status + '）');
    return await res.text();
  }

  async function buildStandaloneHtml(payload) {
    const [bbcodeSrc, audioSrc, stageSrc] = await Promise.all([
      fetchModuleSource('js/bbcode.js'),
      fetchModuleSource('js/audio.js'),
      fetchModuleSource('js/stage.js')
    ]);

    const json = JSON.stringify(payload)
      .replace(/</g, '\\u003c')
      .replace(/-->/g, '--\\u003e');

    const playerScript = `
function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const ExtractorModule = { escapeHtml: escapeHtml };

${bbcodeSrc}

${audioSrc}

${stageSrc}

const DATA = ${json};

const state = {
  script: DATA.script,
  speakers: DATA.speakers,
  lineOverrides: DATA.overrides,
  defaultBgURL: DATA.defaultBgURL || null,
  defaultBgmURL: DATA.defaultBgmURL || null,
  defaultBgmName: DATA.defaultBgmName || '',
  bgmVolume: DATA.bgmVolume != null ? DATA.bgmVolume : 0.6,
  currentBgmKey: null,
  index: 0,
  typing: false,
  typeTimer: null,
  typeSpeed: DATA.typeSpeed || 28,
  autoDelay: DATA.autoDelay || 1200,
  autoPlay: false,
  autoTimer: null
};

if (DATA.sfxVolume != null) AudioModule.setGlobalSfxVolume(DATA.sfxVolume);
if (DATA.textStyle) StageModule.applyTextStyle(DATA.textStyle);

function $(id){ return document.getElementById(id); }

function showLine(idx, redrawOnly){
  if (idx < 0 || idx >= state.script.length) return;
  state.index = idx;
  if (state.autoTimer){ clearTimeout(state.autoTimer); state.autoTimer = null; }

  const line = state.script[idx];
  const ov = state.lineOverrides[line.key] || {};
  const sp = line.player ? state.speakers[line.player] : null;

  $('vnProgress').textContent = (idx + 1) + ' / ' + state.script.length;

  const bgURL = StageModule.resolveBackgroundURL(idx, state.script, state.lineOverrides, state.defaultBgURL);
  StageModule.renderStage(line, ov, sp, bgURL, state.speakers);
  AudioModule.updateBgmForLine(idx, state);

  if (!redrawOnly && ov.sfxURL) AudioModule.playSfx(ov.sfxURL, ov.sfxVolume);
  if (redrawOnly) return;

  if (state.typeTimer){ clearInterval(state.typeTimer); state.typeTimer = null; }
  const textEl = $('vnText');
  const full = StageModule.displayTextFor(line, state.speakers) + StageModule.repeatSuffixSafe(line);
  const tokens = BBCodeModule.parseFormattedTokens(full);
  textEl.innerHTML = '';
  let i = 0;
  state.typing = true;
  state.typeTimer = setInterval(function(){
    i++;
    textEl.innerHTML = BBCodeModule.tokensToHtml(tokens.slice(0, i));
    if (i >= tokens.length){
      clearInterval(state.typeTimer);
      state.typeTimer = null;
      state.typing = false;
      onFullyShown();
    }
  }, Math.max(6, state.typeSpeed));
}

function completeTyping(){
  if (!state.typing) return;
  clearInterval(state.typeTimer);
  state.typeTimer = null;
  state.typing = false;
  const line = state.script[state.index];
  const full = StageModule.displayTextFor(line, state.speakers) + StageModule.repeatSuffixSafe(line);
  const tokens = BBCodeModule.parseFormattedTokens(full);
  $('vnText').innerHTML = BBCodeModule.tokensToHtml(tokens);
  onFullyShown();
}

function onFullyShown(){
  if (state.autoPlay){
    state.autoTimer = setTimeout(function(){
      if (!nextLine()) setAutoPlay(false);
    }, state.autoDelay);
  }
}

function nextLine(){
  if (state.index >= state.script.length - 1) return false;
  showLine(state.index + 1, false);
  return true;
}
function prevLine(){
  if (state.index <= 0) return false;
  showLine(state.index - 1, false);
  return true;
}
function advance(){
  if (state.typing) completeTyping();
  else nextLine();
}
function setAutoPlay(on){
  state.autoPlay = on;
  const btn = $('autoBtn');
  btn.classList.toggle('autoplay-on', on);
  btn.textContent = on ? '自動播放中' : '自動播放';
  if (state.autoTimer){ clearTimeout(state.autoTimer); state.autoTimer = null; }
  if (on && !state.typing) onFullyShown();
}

$('stage').addEventListener('click', advance);
$('prevBtn').addEventListener('click', function(){ setAutoPlay(false); prevLine(); });
$('nextBtn').addEventListener('click', function(){ setAutoPlay(false); advance(); });
$('autoBtn').addEventListener('click', function(){ setAutoPlay(!state.autoPlay); });
$('restartBtn').addEventListener('click', function(){
  setAutoPlay(false);
  StageModule.resetStageSlots();
  showLine(0, false);
});
document.addEventListener('keydown', function(e){
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight'){ e.preventDefault(); advance(); }
  else if (e.key === 'ArrowLeft'){ setAutoPlay(false); prevLine(); }
});

const tryPlay = function(){
  AudioModule.updateBgmForLine(state.index, state);
  document.removeEventListener('click', tryPlay);
};
document.addEventListener('click', tryPlay);

if (state.script.length) showLine(0, false);
`;

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
.portrait-slot{position:absolute;bottom:0;height:82%;width:34%;display:flex;align-items:flex-end;justify-content:center;pointer-events:none;opacity:0;transition:opacity .2s ease, filter .2s ease;transform-origin:bottom center;}
.portrait-slot img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 10px 24px rgba(0,0,0,.55));transition:transform .2s ease;}
.portrait-slot.active{opacity:1;filter:brightness(1) saturate(1);}
.portrait-slot.active.dimmed{filter:brightness(.45) saturate(.6);}
.stage-illust{position:absolute;top:45%;left:50%;transform:translate(-50%, -50%) scale(0.92);z-index:3;pointer-events:none;opacity:0;transition:opacity 0.22s ease, transform 0.22s ease;max-width:80%;max-height:55%;display:flex;align-items:center;justify-content:center;}
.stage-illust.active{opacity:1;transform:translate(-50%, -50%) scale(1);}
.stage-illust img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 12px 32px rgba(0,0,0,0.8));border-radius:8px;}
.vn-box{position:relative;z-index:4;width:min(1000px,92%);margin:0 0 26px;background:var(--vn-box-bg, rgba(14,14,17,.86));border:1px solid #3a3a44;border-radius:12px;padding:16px 22px 20px;backdrop-filter:blur(3px);min-height:112px;box-shadow:0 12px 32px rgba(0,0,0,.5);}
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
  <div class="topbar">Venor2</div>
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
${playerScript}
})();
</script>
</body>
</html>`;
  }


  function parseExportedHtmlData(text) {
    const m = text.match(/const DATA = ([\s\S]*?);\s*const state = \{/);
    if (!m) throw new Error('找不到可匯入的資料，這個檔案可能不是本工具匯出的。');
    try { return JSON.parse(m[1]); } catch (err) { throw new Error('資料格式錯誤，無法解析。'); }
  }

  function loadStateFromExportedData(data, state, ensureSpeaker, colorForSpeaker) {
    state.script = (data.script || []).map(l => ({
      type: l.type, player: l.player, text: l.text, count: l.count,
      key: l.key || `${l.type}|${l.player || ''}|${l.text}`,
    }));

    state.speakers = {};
    Object.keys(data.speakers || {}).forEach(name => {
      const sp = data.speakers[name] || {};
      const ports = (sp.portraits || []).map(p => {
        const url = p.url || p.data;
        const file = dataURLtoFile(url, p.name);
        return { name: p.name, file, url, flip: !!p.flip };
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
      if (ov.speaker) out.speaker = ov.speaker;
      if (ov.portraitIdx !== undefined && ov.portraitIdx !== null) out.portraitIdx = ov.portraitIdx;
      if (ov.flip !== undefined) out.flip = ov.flip;
      const bgURL = ov.bgURL || ov.bg;
      const illustURL = ov.illustURL || ov.illust;
      const sfxURL = ov.sfxURL || ov.sfx;
      const bgmURL = ov.bgmURL || ov.bgm;
      if (bgURL) { const f = dataURLtoFile(bgURL, 'line_bg'); out.bgURL = bgURL; out.bgFile = f; out.bgName = f ? f.name : ''; }
      if (illustURL) { const f = dataURLtoFile(illustURL, 'line_illust'); out.illustURL = illustURL; out.illustFile = f; out.illustName = f ? f.name : ''; }
      if (sfxURL) { const f = dataURLtoFile(sfxURL, 'line_sfx'); out.sfxURL = sfxURL; out.sfxFile = f; out.sfxName = f ? f.name : ''; }
      if (ov.sfxVolume !== undefined) out.sfxVolume = ov.sfxVolume;
      if (ov.bgmAction) {
        out.bgmAction = ov.bgmAction;
        if (bgmURL) { const f = dataURLtoFile(bgmURL, 'line_bgm'); out.bgmURL = bgmURL; out.bgmFile = f; out.bgmName = ov.bgmName || (f ? f.name : ''); }
      }
      if (Object.keys(out).length) state.lineOverrides[key] = out;
    });

    const defaultBgURL = data.defaultBgURL || data.defaultBg;
    const defaultBgmURL = data.defaultBgmURL || data.defaultBgm;

    state.defaultBgURL = defaultBgURL || null;
    state.defaultBgFile = defaultBgURL ? dataURLtoFile(defaultBgURL, 'default_bg') : null;
    state.defaultBgName = state.defaultBgFile ? state.defaultBgFile.name : (defaultBgURL ? '（已匯入背景）' : '');

    state.defaultBgmURL = defaultBgmURL || null;
    state.defaultBgmFile = defaultBgmURL ? dataURLtoFile(defaultBgmURL, 'default_bgm') : null;
    state.defaultBgmName = data.defaultBgmName || (state.defaultBgmFile ? state.defaultBgmFile.name : (defaultBgmURL ? '（已匯入BGM）' : ''));

    state.bgmVolume = (data.bgmVolume != null) ? data.bgmVolume : 0.6;
    if (data.sfxVolume != null) AudioModule.setGlobalSfxVolume(data.sfxVolume);
    state.typeSpeed = data.typeSpeed || 28;
    state.autoDelay = data.autoDelay || 1200;
    if (data.textStyle) state.textStyle = Object.assign({}, state.textStyle, data.textStyle);
  }

  return {
    fileToDataURL,
    dataURLtoFile,
    buildExportPayload,
    buildStandaloneHtml,
    parseExportedHtmlData,
    loadStateFromExportedData
  };
})();