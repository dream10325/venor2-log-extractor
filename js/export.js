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
          data: p.file ? await fileToDataURL(p.file) : p.url,
          flip: !!p.flip
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
      if (ov.speaker) out.speaker = ov.speaker;
      if (ov.portraitIdx !== undefined && ov.portraitIdx !== null) out.portraitIdx = ov.portraitIdx;
      if (ov.flip !== undefined) out.flip = ov.flip;
      if (ov.bgFile) out.bg = await fileToDataURL(ov.bgFile);
      else if (ov.bgURL && ov.bgURL.startsWith('data:')) out.bg = ov.bgURL;
      if (ov.illustFile) out.illust = await fileToDataURL(ov.illustFile);
      else if (ov.illustURL && ov.illustURL.startsWith('data:')) out.illust = ov.illustURL;
      if (ov.sfxFile) out.sfx = await fileToDataURL(ov.sfxFile);
      else if (ov.sfxURL && ov.sfxURL.startsWith('data:')) out.sfx = ov.sfxURL;
      if (ov.sfxVolume !== undefined) out.sfxVolume = ov.sfxVolume;
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
      sfxVolume: AudioModule.getGlobalSfxVolume(),
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
.portrait-slot{position:absolute;bottom:0;height:82%;width:34%;display:flex;align-items:flex-end;justify-content:center;pointer-events:none;opacity:0;transition:opacity .2s ease, filter .2s ease;transform-origin:bottom center;}
.portrait-slot img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 10px 24px rgba(0,0,0,.55));transition:transform .2s ease;}
.portrait-slot.active{opacity:1;filter:brightness(1) saturate(1);}
.portrait-slot.active.dimmed{filter:brightness(.45) saturate(.6);}
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
  const DATA = ${json};
  const state = { index:0, typing:false, typeTimer:null, autoPlay:false, autoTimer:null, currentBgmKey:null };
  const stageSlots = { left:null, center:null, right:null };
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

  function applyTransform(slot, imgEl, sp, flip){
    const scale = sp.scale || 1;
    const offX = sp.offsetX || 0;
    const offY = sp.offsetY || 0;
    const scaleX = flip ? -1 : 1;
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
    imgEl.style.transform = "scaleX(" + scaleX + ")";
  }

  function showLine(idx, redrawOnly){
    if(idx < 0 || idx >= DATA.script.length) return;
    state.index = idx;
    if(state.autoTimer){ clearTimeout(state.autoTimer); state.autoTimer = null; }

    const line = DATA.script[idx];
    const ov = DATA.overrides[line.key] || {};
    $('vnProgress').textContent = (idx+1) + ' / ' + DATA.script.length;

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
    let activeSpeakerName = null;
    let targetSpeaker = null;

    if(line.type === 'chat'){
      vnBox.classList.remove('narration');
      targetSpeaker = line.player ? DATA.speakers[line.player] : null;
      $('vnName').textContent = targetSpeaker ? targetSpeaker.displayName : (line.player || '未知角色');
      vnBox.style.setProperty('--vn-name-color', targetSpeaker ? targetSpeaker.color : '#800020');
      activeSpeakerName = targetSpeaker ? targetSpeaker.name : null;
    } else {
      vnBox.classList.add('narration');
      $('vnName').textContent = '';
      if(ov.speaker && DATA.speakers[ov.speaker]){
        targetSpeaker = DATA.speakers[ov.speaker];
      } else if(line.player && DATA.speakers[line.player]){
        targetSpeaker = DATA.speakers[line.player];
      }
      activeSpeakerName = targetSpeaker ? targetSpeaker.name : null;
    }

    if(targetSpeaker){
      const pos = targetSpeaker.position || 'center';
      const img = resolvePortrait(targetSpeaker, ov);
      if(img){
        const isFlip = (ov.flip !== undefined) ? !!ov.flip : (targetSpeaker.portraits && targetSpeaker.portraits[ov.portraitIdx || targetSpeaker.defaultPortraitIdx || 0] && !!targetSpeaker.portraits[ov.portraitIdx || targetSpeaker.defaultPortraitIdx || 0].flip);
        stageSlots[pos] = { speaker: targetSpeaker, img: img, flip: isFlip };
      }
    }

    ['left','center','right'].forEach(function(pos){
      const posKey = capitalize(pos);
      const slot = $('portrait' + posKey);
      const imgEl = $('portrait' + posKey + 'Img');
      const data = stageSlots[pos];
      if(data && data.img){
        imgEl.src = data.img;
        applyTransform(slot, imgEl, data.speaker, data.flip);
        slot.classList.add('active');
        if(activeSpeakerName && data.speaker.name === activeSpeakerName){
          slot.classList.remove('dimmed');
        } else {
          slot.classList.add('dimmed');
        }
      } else {
        slot.classList.remove('active');
        slot.classList.remove('dimmed');
        slot.style.left = ''; slot.style.right = ''; slot.style.transform = '';
        imgEl.style.transform = ''; imgEl.removeAttribute('src');
      }
    });

    if(!redrawOnly && ov.sfx){
      const sfx = new Audio(ov.sfx);
      sfx.volume = ov.sfxVolume !== undefined ? ov.sfxVolume : (DATA.sfxVolume !== undefined ? DATA.sfxVolume : 0.9);
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
  $('restartBtn').addEventListener('click', function(){ setAutoPlay(false); stageSlots.left=null; stageSlots.center=null; stageSlots.right=null; showLine(0, false); });
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
        const file = dataURLtoFile(p.data, p.name);
        return { name: p.name, file, url: p.data, flip: !!p.flip };
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
      if (ov.bg) { const f = dataURLtoFile(ov.bg, 'line_bg'); out.bgURL = ov.bg; out.bgFile = f; out.bgName = f ? f.name : ''; }
      if (ov.illust) { const f = dataURLtoFile(ov.illust, 'line_illust'); out.illustURL = ov.illust; out.illustFile = f; out.illustName = f ? f.name : ''; }
      if (ov.sfx) { const f = dataURLtoFile(ov.sfx, 'line_sfx'); out.sfxURL = ov.sfx; out.sfxFile = f; out.sfxName = f ? f.name : ''; }
      if (ov.sfxVolume !== undefined) out.sfxVolume = ov.sfxVolume;
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