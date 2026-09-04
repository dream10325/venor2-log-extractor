//提取log部分

const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

const SERVER_CHAT_RE = /^\[(?:(\d{1,2}[A-Za-z]{3}\d{4})\s+)?(\d{2}:\d{2}:\d{2})(?:\.\d+)?\] \[[^\]]*\] \[nicknameforge\/\]: \[([^\]]+)\]\s*<(.+)>\{([^}]*)\}\s?(.*)$/;
const SERVER_ACTION_RE = /^\[(?:(\d{1,2}[A-Za-z]{3}\d{4})\s+)?(\d{2}:\d{2}:\d{2})(?:\.\d+)?\] \[[^\]]*\] \[nicknameforge\/\]: \[([^\]]+)\] \* <(.+)>\{([^}]*)\} (.*)$/;
const LEGACY_ACTION_RE = /^\[(\d{1,2}[A-Za-z]{3}\d{4}) (\d{2}:\d{2}:\d{2})\.\d+\] \[Server thread\/INFO\] \[net\.minecraft\.server\.MinecraftServer\/\]: (?:\[Not Secure\] )?(\*.*)$/;

const CLIENT_CHAT_RE_CHANNEL = /^\[(\d{2}:\d{2}:\d{2})\] \[Render thread\/INFO\]: \[System\] \[CHAT\] \[([^\]]+)\] (.+)$/;
const CLIENT_CHAT_RE = /^\[(\d{2}:\d{2}:\d{2})\] \[Render thread\/INFO\]: \[System\] \[CHAT\] (.+?) \? (.*)$/;
const CLIENT_ACTION_RE_CHANNEL = /^\[(\d{2}:\d{2}:\d{2})\] \[Render thread\/INFO\]: (?:\[Not Secure\] )?(?:\[System\] )?\[CHAT\] \[([^\]]+)\] (\*.*)$/;
const CLIENT_ACTION_RE = /^\[(\d{2}:\d{2}:\d{2})\] \[Render thread\/INFO\]: (?:\[Not Secure\] )?(?:\[System\] )?\[CHAT\] (\*.*)$/;
const CHAT_NAME_MSG_SPLIT_RE = / {3,}/;

let entries = [];

function parseLogDate(dateStr, timeStr){
  const m = dateStr.match(/^(\d{1,2})([A-Za-z]{3})(\d{4})$/);
  if(!m) return null;
  const day = parseInt(m[1],10);
  const month = MONTHS[m[2]];
  const year = parseInt(m[3],10);
  const [hh,mm,ss] = timeStr.split(':').map(Number);
  if(month === undefined) return null;
  return new Date(year, month, day, hh, mm, ss);
}

function parseClientTime(timeStr){
  const [hh,mm,ss] = timeStr.split(':').map(Number);
  return new Date(2000, 0, 1, hh, mm, ss);
}

function normalizeChannel(tag){
  if(!tag) return null;
  const t = tag.trim();
  if(t.toLowerCase() === 'chat') return null;
  return t;
}

function parseLog(text){
  const lines = text.split(/\r?\n/);

  let hasChannelFormat = false;
  for(const rawLine of lines){
    const line = rawLine.replace(/\r$/, '');
    if(CLIENT_CHAT_RE_CHANNEL.test(line)){ hasChannelFormat = true; break; }
    const sm = line.match(SERVER_CHAT_RE);
    if(sm && normalizeChannel(sm[3]) !== null){ hasChannelFormat = true; break; }
  }

  const result = [];
  let cleanSeq = 0;
  for(const rawLine of lines){
    const line = rawLine.replace(/\r$/, '');
    if(!line.trim()) continue;

    let m = line.match(SERVER_CHAT_RE);
    if(m){
      const date = m[1] ? parseLogDate(m[1], m[2]) : parseClientTime(m[2]);
      const channel = normalizeChannel(m[3]);
      const player = m[4];
      const rawId = m[5];
      const text_ = m[6];
      result.push({type:'chat', date, player, rawId, text:text_, channel, raw: `<${player}> ${text_}`});
      continue;
    }
    m = line.match(SERVER_ACTION_RE);
    if(m){
      const date = m[1] ? parseLogDate(m[1], m[2]) : parseClientTime(m[2]);
      const channel = normalizeChannel(m[3]);
      const player = m[4];
      const rawId = m[5];
      const actionText = m[6];
      result.push({type:'action', date, player, rawId, text:actionText, raw:actionText, channel});
      continue;
    }
    m = line.match(LEGACY_ACTION_RE);
    if(m){
      const date = parseLogDate(m[1], m[2]);
      result.push({type:'action', date, player:null, text:m[3], raw:m[3], channel:null});
      continue;
    }

    m = line.match(CLIENT_CHAT_RE_CHANNEL);
    if(m){
      const parts = m[3].split(CHAT_NAME_MSG_SPLIT_RE);
      if(parts.length >= 2){
        const date = parseClientTime(m[1]);
        const channel = normalizeChannel(m[2]);
        const player = parts[0].trim();
        const msg = parts.slice(1).join('   ');
        result.push({type:'chat', date, player, text:msg, channel, raw: `<${player}> ${msg}`});
        continue;
      }
    }
    m = !hasChannelFormat && line.match(CLIENT_CHAT_RE);
    if(m){
      const date = parseClientTime(m[1]);
      const player = m[2].trim();
      result.push({type:'chat', date, player, text:m[3], channel:null, raw: `<${player}> ${m[3]}`});
      continue;
    }
    m = line.match(CLIENT_ACTION_RE_CHANNEL);
    if(m){
      const date = parseClientTime(m[1]);
      const channel = normalizeChannel(m[2]);
      result.push({type:'action', date, player:null, text:m[3], raw:m[3], channel});
      continue;
    }
    m = !hasChannelFormat && line.match(CLIENT_ACTION_RE);
    if(m){
      const date = parseClientTime(m[1]);
      result.push({type:'action', date, player:null, text:m[2], raw:m[2], channel:null});
      continue;
    }

    m = line.match(/^<(.+?)>\s?(.*)$/);
    cleanSeq += 1;
    const cleanDate = new Date(2000, 0, 1, 0, 0, cleanSeq % 86400);
    if(m){
      const player = m[1].trim();
      const text_ = m[2];
      if(/^-{2,}.*-{2,}$/.test(text_.trim())) continue;
      result.push({type:'chat', date:cleanDate, player, text:text_, channel:null, raw: `<${player}> ${text_}`});
      continue;
    }
    if(/^-{2,}.*-{2,}$/.test(line.trim())) continue;
    result.push({type:'action', date:cleanDate, player:null, text:line.trim(), raw:line.trim(), channel:null});
  }
  attributeActionPlayers(result);
  return result;
}

function attributeActionPlayers(list){
  const chatPlayers = Array.from(new Set(list.filter(e=>e.type==='chat').map(e=>e.player)));
  chatPlayers.sort((a,b)=> b.length - a.length);
  for(const e of list){
    if(e.type !== 'action') continue;
    if(e.player) continue;
    const body = e.text.replace(/^\*\s*/, '');
    let matched = null;
    for(const name of chatPlayers){
      if(!name) continue;
      if(body === name || body.startsWith(name + ' ') || body.startsWith(name + '\u3000')){
        matched = name;
        break;
      }
    }
    if(matched){
      e.player = matched;
      e.text = stripActionName(e.text, matched);
    } else {
      e.text = stripActionMarker(e.text);
    }
    e.raw = e.text;
  }
}

function stripActionMarker(text){
  return text.replace(/^\*[ \u3000]*/, '');
}

function stripActionName(text, name){
  const prefixes = [`* ${name} `, `* ${name}\u3000`];
  for(const p of prefixes){
    if(text.startsWith(p)) return text.slice(p.length);
  }
  if(text === `* ${name}`) return '';
  return stripActionMarker(text);
}

let selectedPlayers = new Set();

function refreshPlayerList(){
  const box = document.getElementById('chipHints');
  const chatPlayers = entries.filter(e=>e.type==='chat').map(e=>e.player);
  const counts = {};
  chatPlayers.forEach(p => counts[p] = (counts[p]||0)+1);
  const names = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);

  selectedPlayers = new Set(Array.from(selectedPlayers).filter(n => counts[n] !== undefined));

  if(names.length === 0){
    box.innerHTML = '';
    return;
  }
  box.innerHTML = names.map(n =>
    `<span class="chip" data-name="${escapeHtml(n)}">${escapeHtml(n)} · ${counts[n]}</span>`
  ).join('');
  updateChipActiveState();

  box.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      document.getElementById('scopeSome').checked = true;
      const name = chip.getAttribute('data-name');
      if(selectedPlayers.has(name)){
        selectedPlayers.delete(name);
      } else {
        selectedPlayers.add(name);
      }
      updateChipActiveState();
    });
  });
}

function updateChipActiveState(){
  document.querySelectorAll('#chipHints .chip').forEach(chip=>{
    const name = chip.getAttribute('data-name');
    chip.classList.toggle('active', selectedPlayers.has(name));
  });
}

let selectedChannels = new Set();
const NO_CHANNEL_LABEL = '（未分頻道）';

function refreshChannelList(){
  const box = document.getElementById('channelChips');
  const chatEntries = entries.filter(e=>e.type==='chat');
  const counts = {};
  chatEntries.forEach(e => {
    const key = e.channel === null ? NO_CHANNEL_LABEL : e.channel;
    counts[key] = (counts[key]||0)+1;
  });
  const names = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);

  selectedChannels = new Set(Array.from(selectedChannels).filter(n => counts[n] !== undefined));

  if(names.length === 0){
    box.innerHTML = '';
    return;
  }
  box.innerHTML = names.map(n =>
    `<span class="chip" data-name="${escapeHtml(n)}">${escapeHtml(n)} · ${counts[n]}</span>`
  ).join('');
  updateChannelChipActiveState();

  box.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      document.getElementById('channelSome').checked = true;
      const name = chip.getAttribute('data-name');
      if(selectedChannels.has(name)){
        selectedChannels.delete(name);
      } else {
        selectedChannels.add(name);
      }
      updateChannelChipActiveState();
    });
  });
}

function updateChannelChipActiveState(){
  document.querySelectorAll('#channelChips .chip').forEach(chip=>{
    const name = chip.getAttribute('data-name');
    chip.classList.toggle('active', selectedChannels.has(name));
  });
}

function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function handleText(text){
  entries = parseLog(text);
  refreshPlayerList();
  refreshChannelList();
}

document.getElementById('rawInput').addEventListener('input', (e)=>{
  handleText(e.target.value);
});

function decodeLogBuffer(buffer){
  let text = new TextDecoder('utf-8', {fatal:false}).decode(buffer);
  const badCount = (text.match(/\uFFFD/g) || []).length;
  if(badCount > 0){
    try{
      text = new TextDecoder('big5').decode(buffer);
    }catch(e){}
  }
  return text;
}

function looksLikeGzip(buffer, filename){
  if(/\.gz$/i.test(filename)) return true;
  const bytes = new Uint8Array(buffer.slice(0, 2));
  return bytes.length === 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function decompressGzip(buffer){
  if(typeof DecompressionStream === 'undefined'){
    throw new Error('這個瀏覽器不支援自動解壓縮 .gz，請先手動解壓縮成 .log / .txt 後再匯入');
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}

async function loadFile(file){
  const fileNameEl = document.getElementById('fileName');
  fileNameEl.textContent = `${file.name}（讀取中…）`;
  try{
    let buffer = await file.arrayBuffer();
    if(looksLikeGzip(buffer, file.name)){
      fileNameEl.textContent = `${file.name}（解壓縮中…）`;
      buffer = await decompressGzip(buffer);
    }
    const text = decodeLogBuffer(buffer);
    document.getElementById('rawInput').value = text;
    handleText(text);
    fileNameEl.textContent = file.name;
  }catch(err){
    fileNameEl.textContent = `讀取失敗：${err && err.message ? err.message : err}`;
  }
}

document.getElementById('fileInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  loadFile(file);
});

const dropZone = document.getElementById('dropZone');
['dragenter','dragover'].forEach(evt=>{
  dropZone.addEventListener(evt, (e)=>{
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover');
  });
});
['dragleave','dragend'].forEach(evt=>{
  dropZone.addEventListener(evt, (e)=>{
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
  });
});
dropZone.addEventListener('drop', (e)=>{
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if(!file) return;
  document.getElementById('fileInput').value = '';
  loadFile(file);
});

document.getElementById('clearBtn').addEventListener('click', ()=>{
  document.getElementById('rawInput').value = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('fileName').textContent = '尚未選擇檔案';
  entries = [];
  refreshPlayerList();
  refreshChannelList();
});

document.querySelectorAll('input[name="scopeMode"]').forEach(radio=>{
  radio.addEventListener('change', ()=>{
    document.getElementById('chipHints').style.opacity =
      document.getElementById('scopeAll').checked ? '0.45' : '1';
  });
});

document.querySelectorAll('input[name="channelMode"]').forEach(radio=>{
  radio.addEventListener('change', ()=>{
    document.getElementById('channelChips').style.opacity =
      document.getElementById('channelAll').checked ? '0.45' : '1';
  });
});

function entrySecondsOfDay(entry){
  const d = entry.date;
  return d.getHours()*3600 + d.getMinutes()*60 + d.getSeconds();
}

function readTimeField(prefix, second){
  const hour = parseInt(document.getElementById(prefix+'Hour').value, 10);
  const minute = parseInt(document.getElementById(prefix+'Minute').value, 10);
  if([hour, minute].some(v => isNaN(v))) return null;
  return hour*3600 + minute*60 + second;
}

function runFilter(){
  const startSec = readTimeField('start', 0);
  const endSec = readTimeField('end', 59);

  const scopeAll = document.getElementById('scopeAll').checked;
  const selectedLower = scopeAll ? [] : Array.from(selectedPlayers).map(p=>p.toLowerCase());
  const includeActions = document.getElementById('includeActions').checked;
  const applyScopeToActions = document.getElementById('applyScopeToActions').checked;

  const channelAll = document.getElementById('channelAll').checked;
  const selectedChans = channelAll ? [] : Array.from(selectedChannels);

  const out = [];
  for(const e of entries){
    if(!e.date) continue;
    const sec = entrySecondsOfDay(e);
    if(startSec !== null && endSec !== null){
      const inRange = (startSec <= endSec)
        ? (sec >= startSec && sec <= endSec)
        : (sec >= startSec || sec <= endSec);
      if(!inRange) continue;
    } else if(startSec !== null){
      if(sec < startSec) continue;
    } else if(endSec !== null){
      if(sec > endSec) continue;
    }

    if(e.type === 'chat'){
      if(selectedLower.length > 0 && !selectedLower.includes(e.player.toLowerCase())) continue;
      if(selectedChans.length > 0){
        const key = e.channel === null ? NO_CHANNEL_LABEL : e.channel;
        if(!selectedChans.includes(key)) continue;
      }
      out.push(e);
    } else if(e.type === 'action'){
      if(!includeActions) continue;
      if(applyScopeToActions && selectedLower.length > 0){
        if(!e.player || !selectedLower.includes(e.player.toLowerCase())) continue;
      }
      if(selectedChans.length > 0 && e.channel !== null){
        const key = e.channel === null ? NO_CHANNEL_LABEL : e.channel;
        if(!selectedChans.includes(key)) continue;
      }
      out.push(e);
    }
  }

  if(document.getElementById('hideDuplicates').checked){
    return dedupeEntries(out, 5*60*1000);
  }
  return out;
}

function dedupeEntries(list, thresholdMs){
  const lastSeen = new Map();
  const output = [];
  for(const e of list){
    const key = `${e.type}|${e.channel || ''}|${e.player || ''}|${e.text}`;
    const prev = lastSeen.get(key);
    if(prev && (e.date - prev.date) <= thresholdMs){
      prev.date = e.date;
      prev.entry.count += 1;
      continue;
    }
    const entryCopy = Object.assign({}, e, {count: 1});
    lastSeen.set(key, {date: e.date, entry: entryCopy});
    output.push(entryCopy);
  }
  return output;
}

function repeatSuffix(e){
  return (e.count && e.count > 1) ? ` (x${e.count})` : '';
}

function renderOutput(list){
  const outDiv = document.getElementById('output');
  if(list.length === 0){
    outDiv.innerHTML = '<span class="placeholder">篩選後沒有符合的紀錄</span>';
    return;
  }
  const html = list.map(e=>{
    if(e.type === 'chat'){
      return `<span class="chat-name">&lt;${escapeHtml(e.player)}&gt;</span> ${escapeHtml(e.text)}${escapeHtml(repeatSuffix(e))}`;
    } else {
      return `<span class="action-line">${escapeHtml(e.text)}${escapeHtml(repeatSuffix(e))}</span>`;
    }
  }).join('\n');
  outDiv.innerHTML = html;
}

function getPlainOutput(list){
  return list.map(e => e.type === 'chat' ? `<${e.player}> ${e.text}${repeatSuffix(e)}` : `${e.text}${repeatSuffix(e)}`).join('\n');
}

let lastFiltered = [];

document.getElementById('runBtn').addEventListener('click', ()=>{
  if(entries.length === 0 && document.getElementById('rawInput').value.trim()){
    handleText(document.getElementById('rawInput').value);
  }
  lastFiltered = runFilter();
  renderOutput(lastFiltered);
});

document.getElementById('copyBtn').addEventListener('click', async ()=>{
  const text = getPlainOutput(lastFiltered);
  if(!text){ return; }
  try{
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('copyBtn');
    const old = btn.textContent;
    btn.textContent = '已複製';
    setTimeout(()=>btn.textContent = old, 1500);
  }catch(err){
    alert('複製失敗');
  }
});

document.getElementById('downloadBtn').addEventListener('click', ()=>{
  const text = getPlainOutput(lastFiltered);
  if(!text){ return; }
  const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rp_chat_clean.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});