//編輯劇情部分

(function(){

  const COLOR_PALETTE = [
    '#800020','#1d5fae','#2e7d32','#8e44ad','#c2740c',
    '#0b7285','#a12f5e','#5d4037','#37474f','#6a1b9a'
  ];

  const state = {
    script: [],
    speakers: {},
    lineOverrides: {},
    defaultBgURL: null,
    defaultBgFile: null,
    defaultBgName: '',
    bgmURL: null,
    bgmFile: null,
    bgmName: '',
    bgmVolume: 0.6,
    index: 0,
    typing: false,
    typeTimer: null,
    typeSpeed: 28,
    autoDelay: 1200,
    autoPlay: false,
    autoTimer: null,
  };

  function $(id){ return document.getElementById(id); }
  function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

  function lineKey(e){
    return `${e.type}|${e.player || ''}|${e.text}`;
  }

  function colorForSpeaker(name){
    let hash = 0;
    for(let i=0;i<name.length;i++){ hash = (hash*31 + name.charCodeAt(i)) >>> 0; }
    return COLOR_PALETTE[hash % COLOR_PALETTE.length];
  }

  function ensureSpeaker(name){
    if(!state.speakers[name]){
      const used = Object.values(state.speakers).map(s=>s.position);
      let pos = 'center';
      if(!used.includes('left')) pos = 'left';
      else if(!used.includes('right')) pos = 'right';
      state.speakers[name] = {
        name,
        displayName: name,
        color: colorForSpeaker(name),
        imgURL: null,
        imgFile: null,
        imgName: '',
        position: pos,
      };
    }
    return state.speakers[name];
  }

  function repeatSuffixSafe(line){
    return (line.count && line.count > 1) ? ` (x${line.count})` : '';
  }

  function actionDisplayText(line){
    if(line.type !== 'action' || !line.player) return line.text;
    const sp = state.speakers[line.player];
    if(!sp || sp.displayName === line.player) return line.text;
    const name = line.player;
    const text = line.text;
    const prefixes = [`* ${name} `, `* ${name}\u3000`];
    for(const p of prefixes){
      if(text.startsWith(p)){
        return `* ${sp.displayName} ` + text.slice(p.length);
      }
    }
    if(text === `* ${name}`){
      return `* ${sp.displayName}`;
    }
    return text;
  }

  function displayTextFor(line){
    return line.type === 'action' ? actionDisplayText(line) : line.text;
  }

  function getSourceEntries(){
    if(typeof lastFiltered !== 'undefined' && lastFiltered.length) return lastFiltered;
    if(typeof entries !== 'undefined' && entries.length){
      lastFiltered = runFilter();
      renderOutput(lastFiltered);
      return lastFiltered;
    }
    return [];
  }

  function buildScript(src){
    state.script = src.map(e => ({
      type: e.type,
      player: e.player,
      text: e.text,
      count: e.count,
      key: lineKey(e),
    }));
    state.script.forEach(line=>{
      if(line.player) ensureSpeaker(line.player);
    });
  }

  function openPlayerUI(){
    state.index = 0;
    renderSpeakerPanel();
    renderLinePanel();
    $('playerView').hidden = false;
    document.body.style.overflow = 'hidden';
    showLine(0, {resetTyping:true});
  }

  function openPlayer(){
    const src = getSourceEntries();
    if(!src.length){
      alert('目前沒有可播放的內容，請先在上方貼上/匯入 Log，並確認「輸出結果」有東西。');
      return;
    }
    buildScript(src);
    openPlayerUI();
  }

  function closePlayer(){
    setAutoPlay(false);
    clearTyping();
    $('playerView').hidden = true;
    document.body.style.overflow = '';
  }

  function renderSpeakerPanel(){
    const box = $('speakerList');
    const names = Object.keys(state.speakers);
    if(names.length === 0){
      box.innerHTML = '<p class="play-hint">目前的腳本沒有偵測到任何說話者（可能都是無法辨識角色的旁白訊息）。</p>';
      return;
    }
    const counts = {};
    state.script.forEach(l=>{ if(l.player) counts[l.player] = (counts[l.player]||0)+1; });

    box.innerHTML = names.map(name=>{
      const sp = state.speakers[name];
      const renamed = sp.displayName !== name;
      return `
      <div class="speaker-card">
        <div class="speaker-card-head">
          <span class="speaker-swatch" style="background:${sp.color}"></span>
          <input type="text" class="speaker-name-input" data-role="displayName" data-name="${escapeHtml(name)}" value="${escapeHtml(sp.displayName)}" placeholder="角色名稱">
          <span class="speaker-card-count">${counts[name]||0} 句</span>
        </div>
        ${renamed ? `<p class="speaker-card-origname">遊戲暱稱：${escapeHtml(name)}</p>` : ''}
        <div class="speaker-card-body">
          <div class="speaker-portrait-preview" style="${sp.imgURL ? `background-image:url('${sp.imgURL}')` : ''}"></div>
          <div class="speaker-card-controls">
            <label class="mini-file-btn">
              匯入立繪圖片
              <input type="file" accept="image/*" data-role="portrait" data-name="${escapeHtml(name)}">
            </label>
            <select class="pos-select" data-role="position" data-name="${escapeHtml(name)}">
              <option value="left" ${sp.position==='left'?'selected':''}>靠左站位</option>
              <option value="center" ${sp.position==='center'?'selected':''}>置中站位</option>
              <option value="right" ${sp.position==='right'?'selected':''}>靠右站位</option>
            </select>
            ${sp.imgURL ? `<button type="button" class="portrait-clear-btn" data-role="portrait-clear" data-name="${escapeHtml(name)}">移除立繪圖片</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('input[data-role=displayName]').forEach(inp=>{
      inp.addEventListener('input', ()=>{
        const name = inp.getAttribute('data-name');
        state.speakers[name].displayName = inp.value.trim() || name;
        renderLinePanel();
        showLine(state.index, {resetTyping:false, redrawOnly:true});
      });
      inp.addEventListener('click', e=>e.stopPropagation());
    });
    box.querySelectorAll('input[data-role=portrait]').forEach(inp=>{
      inp.addEventListener('change', e=>{
        const file = e.target.files[0];
        if(!file) return;
        const name = inp.getAttribute('data-name');
        const url = URL.createObjectURL(file);
        state.speakers[name].imgURL = url;
        state.speakers[name].imgFile = file;
        state.speakers[name].imgName = file.name;
        renderSpeakerPanel();
        showLine(state.index, {resetTyping:false, redrawOnly:true});
      });
    });
    box.querySelectorAll('[data-role=portrait-clear]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const name = btn.getAttribute('data-name');
        state.speakers[name].imgURL = null;
        state.speakers[name].imgFile = null;
        state.speakers[name].imgName = '';
        renderSpeakerPanel();
        showLine(state.index, {resetTyping:false, redrawOnly:true});
      });
    });
    box.querySelectorAll('select[data-role=position]').forEach(sel=>{
      sel.addEventListener('change', ()=>{
        const name = sel.getAttribute('data-name');
        state.speakers[name].position = sel.value;
        showLine(state.index, {resetTyping:false, redrawOnly:true});
      });
    });
  }

  function speakerLabelFor(line){
    const sp = line.player ? state.speakers[line.player] : null;
    if(line.type === 'chat') return sp ? sp.displayName : (line.player || '');
    return sp ? `${sp.displayName}（動作）` : '旁白／動作';
  }

  function renderLinePanel(){
    const box = $('lineList');
    if(state.script.length === 0){ box.innerHTML = ''; return; }

    box.innerHTML = state.script.map((line, i)=>{
      const ov = state.lineOverrides[line.key] || {};
      const speakerLabel = speakerLabelFor(line);
      const tags = [];
      if(ov.imgURL) tags.push('<span class="line-override-tag">🎭 立繪差分</span>');
      if(ov.bgURL) tags.push('<span class="line-override-tag">🌄 背景圖</span>');
      if(ov.sfxURL) tags.push('<span class="line-override-tag">🔊 音效</span>');
      return `
      <div class="line-row" data-index="${i}">
        <div class="line-row-head">
          <span class="line-idx">#${i+1}</span>
          <span class="line-tag ${line.type}">${line.type==='chat'?'對話':'動作'}</span>
          <span class="line-speaker">${escapeHtml(speakerLabel)}</span>
        </div>
        <textarea class="line-text-edit" data-role="line-text" data-index="${i}" rows="2">${escapeHtml(line.text)}</textarea>
        <div class="line-row-actions">
          <label class="mini-file-btn" onclick="event.stopPropagation()">
            立繪差分
            <input type="file" accept="image/*" data-role="line-img" data-index="${i}">
          </label>
          <label class="mini-file-btn" onclick="event.stopPropagation()">
            背景圖
            <input type="file" accept="image/*" data-role="line-bg" data-index="${i}">
          </label>
          <label class="mini-file-btn" onclick="event.stopPropagation()">
            音效
            <input type="file" accept="audio/*" data-role="line-sfx" data-index="${i}">
          </label>
          ${(ov.imgURL || ov.bgURL || ov.sfxURL) ? `<button type="button" class="mini-file-btn" data-role="line-clear" data-index="${i}">清除本句指定</button>` : ''}
          ${tags.join('')}
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('.line-row').forEach(row=>{
      row.addEventListener('click', ()=>{
        const idx = parseInt(row.getAttribute('data-index'), 10);
        setAutoPlay(false);
        showLine(idx, {resetTyping:true});
      });
    });
    box.querySelectorAll('textarea[data-role=line-text]').forEach(ta=>{
      ta.addEventListener('click', e=>e.stopPropagation());
      ta.addEventListener('input', ()=>{
        const idx = parseInt(ta.getAttribute('data-index'), 10);
        state.script[idx].text = ta.value;
        if(idx === state.index){
          clearTyping();
          $('vnText').textContent = displayTextFor(state.script[idx]) + repeatSuffixSafe(state.script[idx]);
        }
      });
    });
    box.querySelectorAll('input[data-role=line-img]').forEach(inp=>{
      inp.addEventListener('click', e=>e.stopPropagation());
      inp.addEventListener('change', e=>{
        const file = e.target.files[0];
        if(!file) return;
        const idx = parseInt(inp.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        const url = URL.createObjectURL(file);
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], {imgURL:url, imgFile:file, imgName:file.name});
        renderLinePanel();
        if(idx === state.index) showLine(idx, {resetTyping:false, redrawOnly:true});
      });
    });
    box.querySelectorAll('input[data-role=line-bg]').forEach(inp=>{
      inp.addEventListener('click', e=>e.stopPropagation());
      inp.addEventListener('change', e=>{
        const file = e.target.files[0];
        if(!file) return;
        const idx = parseInt(inp.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        const url = URL.createObjectURL(file);
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], {bgURL:url, bgFile:file, bgName:file.name});
        renderLinePanel();
        if(idx === state.index) showLine(idx, {resetTyping:false, redrawOnly:true});
      });
    });
    box.querySelectorAll('input[data-role=line-sfx]').forEach(inp=>{
      inp.addEventListener('click', e=>e.stopPropagation());
      inp.addEventListener('change', e=>{
        const file = e.target.files[0];
        if(!file) return;
        const idx = parseInt(inp.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        const url = URL.createObjectURL(file);
        state.lineOverrides[key] = Object.assign({}, state.lineOverrides[key], {sfxURL:url, sfxFile:file, sfxName:file.name});
        renderLinePanel();
      });
    });
    box.querySelectorAll('[data-role=line-clear]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const key = state.script[idx].key;
        delete state.lineOverrides[key];
        renderLinePanel();
        if(idx === state.index) showLine(idx, {resetTyping:false, redrawOnly:true});
      });
    });

    highlightCurrentLineRow();
  }

  function highlightCurrentLineRow(){
    document.querySelectorAll('.line-row').forEach(row=>{
      row.classList.toggle('current', parseInt(row.getAttribute('data-index'), 10) === state.index);
    });
    const cur = document.querySelector('.line-row.current');
    if(cur) cur.scrollIntoView({block:'nearest'});
  }

  function clearTyping(){
    if(state.typeTimer){ clearInterval(state.typeTimer); state.typeTimer = null; }
    state.typing = false;
  }

  function clearAutoTimer(){
    if(state.autoTimer){ clearTimeout(state.autoTimer); state.autoTimer = null; }
  }

  function resolvePortraitURL(sp, ov){
    return (ov && ov.imgURL) || (sp ? sp.imgURL : null) || null;
  }

  function resolveBackgroundURL(ov){
    return (ov && ov.bgURL) || state.defaultBgURL || null;
  }

  function showLine(idx, opts){
    opts = opts || {};
    if(idx < 0 || idx >= state.script.length) return;
    state.index = idx;
    clearAutoTimer();

    const line = state.script[idx];
    const ov = state.lineOverrides[line.key] || {};

    $('vnProgress').textContent = `${idx+1} / ${state.script.length}`;
    highlightCurrentLineRow();

    const vnBox = $('vnBox');
    const stageBg = $('stageBg');

    ['Left','Center','Right'].forEach(pos=>{
      $('portrait'+pos).classList.remove('active');
    });

    const bgURL = resolveBackgroundURL(ov);
    if(bgURL){
      stageBg.style.backgroundImage = `url('${bgURL}')`;
      stageBg.classList.add('on');
    } else {
      stageBg.classList.remove('on');
      stageBg.style.backgroundImage = '';
    }

    if(line.type === 'chat'){
      vnBox.classList.remove('narration');
      const sp = state.speakers[line.player] || ensureSpeaker(line.player || '未知角色');
      $('vnName').textContent = sp.displayName;
      vnBox.style.setProperty('--vn-name-color', sp.color);

      const imgURL = resolvePortraitURL(sp, ov);
      const posKey = capitalize(sp.position);
      if(imgURL){
        $('portrait'+posKey+'Img').src = imgURL;
        $('portrait'+posKey).classList.add('active');
      }
    } else {
      vnBox.classList.add('narration');
      $('vnName').textContent = '';
      const sp = line.player ? state.speakers[line.player] : null;
      const imgURL = resolvePortraitURL(sp, ov);
      if(sp && imgURL){
        const posKey = capitalize(sp.position);
        $('portrait'+posKey+'Img').src = imgURL;
        $('portrait'+posKey).classList.add('active');
      }
    }

    if(!opts.redrawOnly && ov.sfxURL){
      const sfx = new Audio(ov.sfxURL);
      sfx.volume = 0.9;
      sfx.play().catch(()=>{});
    }

    if(opts.redrawOnly) return;

    clearTyping();
    const textEl = $('vnText');
    const full = displayTextFor(line) + repeatSuffixSafe(line);
    textEl.textContent = '';
    let i = 0;
    state.typing = true;
    state.typeTimer = setInterval(()=>{
      i++;
      textEl.textContent = full.slice(0, i);
      if(i >= full.length){
        clearTyping();
        onLineFullyShown();
      }
    }, Math.max(6, state.typeSpeed));
  }

  function completeTyping(){
    if(!state.typing) return;
    clearTyping();
    const line = state.script[state.index];
    $('vnText').textContent = displayTextFor(line) + repeatSuffixSafe(line);
    onLineFullyShown();
  }

  function onLineFullyShown(){
    if(state.autoPlay){
      state.autoTimer = setTimeout(()=>{
        if(!nextLine()) setAutoPlay(false);
      }, state.autoDelay);
    }
  }

  function nextLine(){
    if(state.index >= state.script.length - 1) return false;
    showLine(state.index + 1, {resetTyping:true});
    return true;
  }
  function prevLine(){
    if(state.index <= 0) return false;
    showLine(state.index - 1, {resetTyping:true});
    return true;
  }

  function handleAdvance(){
    if(state.typing){ completeTyping(); return; }
    nextLine();
  }

  function setAutoPlay(on){
    state.autoPlay = on;
    const btn = $('autoPlayBtn');
    btn.classList.toggle('autoplay-on', on);
    btn.textContent = on ? '⏸ 自動播放中' : '▶ 自動播放';
    clearAutoTimer();
    if(on && !state.typing) onLineFullyShown();
  }

  function fileToDataURL(file){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = ()=> reject(new Error('讀取檔案失敗：' + file.name));
      reader.readAsDataURL(file);
    });
  }

  async function buildExportPayload(){
    const speakersOut = {};
    for(const name of Object.keys(state.speakers)){
      const sp = state.speakers[name];
      speakersOut[name] = {
        displayName: sp.displayName,
        color: sp.color,
        position: sp.position,
        img: sp.imgFile ? await fileToDataURL(sp.imgFile) : null,
      };
    }
    const overridesOut = {};
    for(const key of Object.keys(state.lineOverrides)){
      const ov = state.lineOverrides[key];
      const out = {};
      if(ov.imgFile) out.img = await fileToDataURL(ov.imgFile);
      if(ov.bgFile) out.bg = await fileToDataURL(ov.bgFile);
      if(ov.sfxFile) out.sfx = await fileToDataURL(ov.sfxFile);
      if(Object.keys(out).length) overridesOut[key] = out;
    }
    return {
      script: state.script.map(l => ({type:l.type, player:l.player, text:l.text, count:l.count, key:l.key})),
      speakers: speakersOut,
      overrides: overridesOut,
      defaultBg: state.defaultBgFile ? await fileToDataURL(state.defaultBgFile) : null,
      bgm: state.bgmFile ? await fileToDataURL(state.bgmFile) : null,
      bgmVolume: state.bgmVolume,
      typeSpeed: state.typeSpeed,
      autoDelay: state.autoDelay,
    };
  }

  function buildStandaloneHtml(payload){
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
:root{ --accent:#800020; --accent-2:#008000; }
*{box-sizing:border-box;}
html,body{margin:0;height:100%;background:#0b0b0d;color:#f2f2f2;font-family:Arial,"Microsoft JhengHei",sans-serif;}
#app{position:fixed;inset:0;display:flex;flex-direction:column;}
.topbar{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:8px 14px;background:#161618;border-bottom:1px solid #2a2a2e;font-size:13px;color:#9a9aa2;font-family:"Courier New",monospace;}
.stage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;background:#111114 radial-gradient(ellipse at 50% 30%, #1c1c22 0%, #0c0c0f 70%);display:flex;align-items:flex-end;justify-content:center;cursor:pointer;user-select:none;}
.stage-bg{position:absolute;inset:0;background-size:cover;background-position:center;transition:opacity .25s ease;opacity:0;}
.stage-bg.on{opacity:1;}
.portrait-slot{position:absolute;bottom:0;height:82%;width:34%;display:flex;align-items:flex-end;justify-content:center;pointer-events:none;opacity:0;transform:translateY(2%) scale(.98);transition:opacity .18s ease, transform .18s ease, filter .18s ease;filter:brightness(.55) saturate(.7);}
.portrait-slot img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 10px 24px rgba(0,0,0,.55));}
.portrait-left{left:2%;} .portrait-center{left:50%;transform:translateX(-50%) translateY(2%) scale(.98);} .portrait-right{right:2%;}
.portrait-slot.active{opacity:1;filter:brightness(1) saturate(1);transform:translateY(0) scale(1);}
.portrait-center.active{transform:translateX(-50%) translateY(0) scale(1);}
.vn-box{position:relative;z-index:2;width:min(1000px,92%);margin:0 0 26px;background:rgba(14,14,17,.86);border:1px solid #3a3a44;border-radius:12px;padding:16px 22px 20px;backdrop-filter:blur(2px);min-height:112px;box-shadow:0 12px 32px rgba(0,0,0,.5);}
.vn-box.narration{text-align:center;border-color:#4a3a30;background:rgba(20,15,12,.86);}
.vn-name{display:inline-block;font-weight:700;font-size:15px;padding:3px 14px;border-radius:20px;margin-bottom:8px;background:var(--vn-name-color,#800020);color:#fff;}
.vn-box.narration .vn-name{display:none;}
.vn-text{font-size:17px;line-height:1.75;white-space:pre-wrap;word-break:break-word;min-height:2.6em;}
.vn-box.narration .vn-text{font-style:italic;color:#e4d9c9;}
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
    <div class="portrait-slot portrait-left" id="portraitLeft"><img id="portraitLeftImg" alt=""></div>
    <div class="portrait-slot portrait-center" id="portraitCenter"><img id="portraitCenterImg" alt=""></div>
    <div class="portrait-slot portrait-right" id="portraitRight"><img id="portraitRightImg" alt=""></div>
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
    <button class="btn" id="autoBtn" type="button">▶ 自動播放</button>
    <button class="btn" id="restartBtn" type="button">⟲ 從頭開始</button>
    <span class="hint">空白鍵/Enter/→ 繼續 ←上一句</span>
  </div>
  <audio id="bgmAudio" loop></audio>
</div>
<script>
(function(){
  const DATA = ${json};
  const state = { index:0, typing:false, typeTimer:null, autoPlay:false, autoTimer:null };
  function $(id){ return document.getElementById(id); }
  function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
  function repeatSuffix(l){ return (l.count && l.count > 1) ? ' (x' + l.count + ')' : ''; }

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

  function portraitURL(sp, ov){ return (ov && ov.img) || (sp && sp.img) || null; }
  function backgroundURL(ov){ return (ov && ov.bg) || DATA.defaultBg || null; }

  function showLine(idx, redrawOnly){
    if(idx < 0 || idx >= DATA.script.length) return;
    state.index = idx;
    if(state.autoTimer){ clearTimeout(state.autoTimer); state.autoTimer = null; }

    const line = DATA.script[idx];
    const ov = DATA.overrides[line.key] || {};
    $('vnProgress').textContent = (idx+1) + ' / ' + DATA.script.length;

    ['Left','Center','Right'].forEach(pos=>{ $('portrait'+pos).classList.remove('active'); });

    const bgURL = backgroundURL(ov);
    const stageBg = $('stageBg');
    if(bgURL){ stageBg.style.backgroundImage = "url('" + bgURL + "')"; stageBg.classList.add('on'); }
    else { stageBg.classList.remove('on'); stageBg.style.backgroundImage = ''; }

    const vnBox = $('vnBox');
    const sp = line.player ? DATA.speakers[line.player] : null;
    if(line.type === 'chat'){
      vnBox.classList.remove('narration');
      $('vnName').textContent = sp ? sp.displayName : (line.player || '未知角色');
      vnBox.style.setProperty('--vn-name-color', sp ? sp.color : '#800020');
      const img = portraitURL(sp, ov);
      const posKey = capitalize(sp ? sp.position : 'center');
      if(img){ $('portrait'+posKey+'Img').src = img; $('portrait'+posKey).classList.add('active'); }
    } else {
      vnBox.classList.add('narration');
      $('vnName').textContent = '';
      const img = portraitURL(sp, ov);
      if(sp && img){
        const posKey = capitalize(sp.position);
        $('portrait'+posKey+'Img').src = img;
        $('portrait'+posKey).classList.add('active');
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
    textEl.textContent = '';
    let i = 0;
    state.typing = true;
    state.typeTimer = setInterval(function(){
      i++;
      textEl.textContent = full.slice(0, i);
      if(i >= full.length){
        clearInterval(state.typeTimer); state.typeTimer = null; state.typing = false;
        onFullyShown();
      }
    }, Math.max(6, DATA.typeSpeed || 28));
  }

  function completeTyping(){
    if(!state.typing) return;
    clearInterval(state.typeTimer); state.typeTimer = null; state.typing = false;
    const line = DATA.script[state.index];
    $('vnText').textContent = displayTextFor(line) + repeatSuffix(line);
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
    btn.textContent = on ? '⏸ 自動播放中' : '▶ 自動播放';
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

  if(DATA.bgm){
    const audio = $('bgmAudio');
    audio.src = DATA.bgm;
    audio.volume = DATA.bgmVolume != null ? DATA.bgmVolume : 0.6;
    const tryPlay = function(){ audio.play().catch(function(){}); document.removeEventListener('click', tryPlay); };
    document.addEventListener('click', tryPlay);
  }

  if(DATA.script.length){ showLine(0, false); }
  else { $('vnText').textContent = '（沒有可播放的內容）'; }
})();
</script>
</body>
</html>`;
  }

  async function exportStandaloneHtml(){
    const btn = $('exportHtmlBtn');
    if(!state.script.length){
      alert('目前沒有可匯出的內容');
      return;
    }
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '匯出中（素材較多可能要等一下）';
    try{
      const payload = await buildExportPayload();
      const html = buildStandaloneHtml(payload);
      const blob = new Blob([html], {type:'text/html;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vn_playback.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }catch(err){
      alert('匯出失敗：' + (err && err.message ? err.message : err));
    }finally{
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  function dataURLtoFile(dataURL, filename){
    if(!dataURL) return null;
    const commaIdx = dataURL.indexOf(',');
    if(commaIdx === -1) return null;
    const header = dataURL.slice(0, commaIdx);
    const base64 = dataURL.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : '';
    let bin;
    try{ bin = atob(base64); }catch(err){ return null; }
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, {type: mime});
  }

  function parseExportedHtmlData(text){
    const m = text.match(/const DATA = ([\s\S]*?);\s*const state = \{/);
    if(!m){
      throw new Error('找不到可匯入的資料，這個檔案可能不是本工具「匯出成 HTML」產生的播放檔。');
    }
    try{
      return JSON.parse(m[1]);
    }catch(err){
      throw new Error('資料格式錯誤，無法解析這個檔案。');
    }
  }

  function loadStateFromExportedData(data){
    state.script = (data.script || []).map(l => ({
      type: l.type, player: l.player, text: l.text, count: l.count,
      key: l.key || lineKey(l),
    }));

    state.speakers = {};
    Object.keys(data.speakers || {}).forEach(name=>{
      const sp = data.speakers[name] || {};
      const imgFile = sp.img ? dataURLtoFile(sp.img, name + '_portrait') : null;
      state.speakers[name] = {
        name,
        displayName: sp.displayName || name,
        color: sp.color || colorForSpeaker(name),
        imgURL: sp.img || null,
        imgFile,
        imgName: imgFile ? imgFile.name : '',
        position: sp.position || 'center',
      };
    });

    state.script.forEach(line=>{ if(line.player) ensureSpeaker(line.player); });

    state.lineOverrides = {};
    Object.keys(data.overrides || {}).forEach(key=>{
      const ov = data.overrides[key] || {};
      const out = {};
      if(ov.img){ const f = dataURLtoFile(ov.img, 'line_portrait'); out.imgURL = ov.img; out.imgFile = f; out.imgName = f ? f.name : ''; }
      if(ov.bg){ const f = dataURLtoFile(ov.bg, 'line_bg'); out.bgURL = ov.bg; out.bgFile = f; out.bgName = f ? f.name : ''; }
      if(ov.sfx){ const f = dataURLtoFile(ov.sfx, 'line_sfx'); out.sfxURL = ov.sfx; out.sfxFile = f; out.sfxName = f ? f.name : ''; }
      if(Object.keys(out).length) state.lineOverrides[key] = out;
    });

    state.defaultBgURL = data.defaultBg || null;
    state.defaultBgFile = data.defaultBg ? dataURLtoFile(data.defaultBg, 'default_bg') : null;
    state.defaultBgName = state.defaultBgFile ? state.defaultBgFile.name : (data.defaultBg ? '（先前匯入的背景）' : '');

    state.bgmURL = data.bgm || null;
    state.bgmFile = data.bgm ? dataURLtoFile(data.bgm, 'bgm') : null;
    state.bgmName = state.bgmFile ? state.bgmFile.name : (data.bgm ? '（先前匯入的 BGM）' : '');
    state.bgmVolume = (data.bgmVolume != null) ? data.bgmVolume : 0.6;

    state.typeSpeed = data.typeSpeed || 28;
    state.autoDelay = data.autoDelay || 1200;
  }

  function syncSettingsPanelFromState(){
    $('defaultBgFileName').textContent = state.defaultBgName || (state.defaultBgURL ? '（先前匯入的背景）' : '尚未匯入');
    $('bgmFileName').textContent = state.bgmName || (state.bgmURL ? '（先前匯入的 BGM）' : '尚未匯入');
    $('bgmVolume').value = state.bgmVolume;
    $('bgmVolumeVal').textContent = Math.round(state.bgmVolume*100) + '%';
    $('typeSpeedRange').value = state.typeSpeed;
    $('typeSpeedVal').textContent = state.typeSpeed + ' ms/字';
    $('autoDelayRange').value = state.autoDelay;
    $('autoDelayVal').textContent = (state.autoDelay/1000).toFixed(1) + ' 秒';
    const audio = $('bgmAudio');
    if(state.bgmURL){
      audio.src = state.bgmURL;
      audio.volume = state.bgmVolume;
      audio.loop = true;
    } else {
      audio.pause();
      audio.removeAttribute('src');
    }
  }

  async function importExportedHtmlFile(file){
    try{
      const text = await file.text();
      const data = parseExportedHtmlData(text);
      loadStateFromExportedData(data);
      openPlayerUI();
      syncSettingsPanelFromState();
    }catch(err){
      alert('匯入失敗：' + (err && err.message ? err.message : err));
    }
  }

  $('playBtn').addEventListener('click', openPlayer);
  $('importPlayInput').addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    importExportedHtmlFile(file);
    e.target.value = '';
  });
  $('exitPlayerBtn').addEventListener('click', closePlayer);
  $('vnClickCatcher').addEventListener('click', handleAdvance);

  $('prevLineBtn').addEventListener('click', ()=>{ setAutoPlay(false); prevLine(); });
  $('nextLineBtn').addEventListener('click', ()=>{ setAutoPlay(false); handleAdvance(); });
  $('autoPlayBtn').addEventListener('click', ()=>{ setAutoPlay(!state.autoPlay); });
  $('restartPlayBtn').addEventListener('click', ()=>{ setAutoPlay(false); showLine(0, {resetTyping:true}); });
  $('exportHtmlBtn').addEventListener('click', exportStandaloneHtml);

  $('togglePanelBtn').addEventListener('click', ()=>{
    $('playerPanel').hidden = !$('playerPanel').hidden;
  });

  document.querySelectorAll('.panel-tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.panel-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.panel-pane').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      $(tab.getAttribute('data-pane')).classList.add('active');
    });
  });

  $('defaultBgInput').addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    state.defaultBgURL = URL.createObjectURL(file);
    state.defaultBgFile = file;
    state.defaultBgName = file.name;
    $('defaultBgFileName').textContent = file.name;
    showLine(state.index, {resetTyping:false, redrawOnly:true});
  });
  $('defaultBgClearBtn').addEventListener('click', ()=>{
    state.defaultBgURL = null;
    state.defaultBgFile = null;
    state.defaultBgName = '';
    $('defaultBgFileName').textContent = '尚未匯入';
    showLine(state.index, {resetTyping:false, redrawOnly:true});
  });

  $('bgmInput').addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    state.bgmURL = URL.createObjectURL(file);
    state.bgmFile = file;
    state.bgmName = file.name;
    $('bgmFileName').textContent = file.name;
    const audio = $('bgmAudio');
    audio.src = state.bgmURL;
    audio.volume = state.bgmVolume;
    audio.loop = true;
    audio.play().catch(()=>{});
  });
  $('bgmVolume').addEventListener('input', e=>{
    state.bgmVolume = parseFloat(e.target.value);
    $('bgmAudio').volume = state.bgmVolume;
    $('bgmVolumeVal').textContent = Math.round(state.bgmVolume*100) + '%';
  });
  $('bgmStopBtn').addEventListener('click', ()=>{
    const audio = $('bgmAudio');
    audio.pause();
    audio.currentTime = 0;
  });

  $('typeSpeedRange').addEventListener('input', e=>{
    state.typeSpeed = parseInt(e.target.value, 10);
    $('typeSpeedVal').textContent = state.typeSpeed + ' ms/字';
  });
  $('autoDelayRange').addEventListener('input', e=>{
    state.autoDelay = parseInt(e.target.value, 10);
    $('autoDelayVal').textContent = (state.autoDelay/1000).toFixed(1) + ' 秒';
  });
  $('clearOverridesBtn').addEventListener('click', ()=>{
    if(!confirm('確定要清除所有「單句指定」的立繪差分／背景圖／音效嗎？（角色預設立繪、預設背景與 BGM 不受影響）')) return;
    state.lineOverrides = {};
    renderLinePanel();
    showLine(state.index, {resetTyping:false, redrawOnly:true});
  });

  document.addEventListener('keydown', e=>{
    if($('playerView').hidden) return;
    if(e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight'){
      e.preventDefault();
      handleAdvance();
    } else if(e.key === 'ArrowLeft'){
      setAutoPlay(false);
      prevLine();
    } else if(e.key === 'Escape'){
      closePlayer();
    }
  });

})();