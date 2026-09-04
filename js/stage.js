const StageModule = (function () {

  const stageSlots = {
    left: null,
    center: null,
    right: null
  };

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function repeatSuffixSafe(line) {
    return (line.count && line.count > 1) ? ` (x${line.count})` : '';
  }

  function actionDisplayText(line, speakers) {
    if (line.type !== 'action' || !line.player) return line.text;
    const sp = speakers[line.player];
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

  function displayTextFor(line, speakers) {
    return line.type === 'action' ? actionDisplayText(line, speakers) : line.text;
  }

  function resolvePortraitURL(sp, portraitIdx) {
    if (!sp || !sp.portraits || sp.portraits.length === 0) return null;
    if (portraitIdx !== undefined && portraitIdx !== null && sp.portraits[portraitIdx]) {
      return sp.portraits[portraitIdx].url;
    }
    const defIdx = sp.defaultPortraitIdx || 0;
    return sp.portraits[defIdx] ? sp.portraits[defIdx].url : sp.portraits[0].url;
  }

  function resolveBackgroundURL(idx, script, lineOverrides, defaultBgURL) {
    if (typeof idx === 'number' && script && lineOverrides) {
      for (let i = idx; i >= 0; i--) {
        const l = script[i];
        if (!l) continue;
        const ov = lineOverrides[l.key];
        if (ov && ov.bgURL) return ov.bgURL;
      }
      return defaultBgURL || null;
    }
    const ov = idx;
    return (ov && ov.bgURL) || defaultBgURL || null;
  }

  function applySpeakerTransform(el, imgEl, sp, flip) {
    const scale = sp.scale || 1;
    const offX = sp.offsetX || 0;
    const offY = sp.offsetY || 0;
    const scaleX = flip ? -1 : 1;

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

    imgEl.style.transform = `scaleX(${scaleX})`;
  }

  function applyTextStyle(textStyle) {
    const root = document.documentElement;
    root.style.setProperty('--vn-font-family', textStyle.fontFamily);
    root.style.setProperty('--vn-font-size', textStyle.fontSize + 'px');
    root.style.setProperty('--vn-font-weight', textStyle.bold ? '700' : 'normal');
    root.style.setProperty('--vn-font-style', textStyle.italic ? 'italic' : 'normal');
    root.style.setProperty('--vn-text-color', textStyle.textColor);

    const r = parseInt(textStyle.boxBgColor.slice(1, 3), 16) || 14;
    const g = parseInt(textStyle.boxBgColor.slice(3, 5), 16) || 14;
    const b = parseInt(textStyle.boxBgColor.slice(5, 7), 16) || 17;
    root.style.setProperty('--vn-box-bg', `rgba(${r}, ${g}, ${b}, ${textStyle.boxOpacity})`);
  }

  function resetStageSlots() {
    stageSlots.left = null;
    stageSlots.center = null;
    stageSlots.right = null;
  }

  function renderStage(line, ov, sp, bgURL, speakers) {
    const vnBox = document.getElementById('vnBox');
    const stageBg = document.getElementById('stageBg');

    if (bgURL) {
      stageBg.style.backgroundImage = `url('${bgURL}')`;
      stageBg.classList.add('on');
    } else {
      stageBg.classList.remove('on');
      stageBg.style.backgroundImage = '';
    }

    const illustBox = document.getElementById('stageIllust');
    const illustImg = document.getElementById('stageIllustImg');
    if (ov.illustURL) {
      illustImg.src = ov.illustURL;
      illustBox.classList.add('active');
    } else {
      illustBox.classList.remove('active');
      illustImg.removeAttribute('src');
    }

    let activeSpeakerName = null;
    let targetSpeaker = sp;

    if (line.type === 'chat') {
      vnBox.classList.remove('narration');
      document.getElementById('vnName').textContent = sp.displayName;
      vnBox.style.setProperty('--vn-name-color', sp.color);
      activeSpeakerName = sp.name;
    } else {
      vnBox.classList.add('narration');
      document.getElementById('vnName').textContent = '';
      if (ov.speaker && speakers && speakers[ov.speaker]) {
        targetSpeaker = speakers[ov.speaker];
      }
      activeSpeakerName = targetSpeaker ? targetSpeaker.name : null;
    }

    if (targetSpeaker) {
      const pos = targetSpeaker.position || 'center';
      const imgURL = resolvePortraitURL(targetSpeaker, ov.portraitIdx);
      if (imgURL) {
        const isFlip = (ov.flip !== undefined && ov.flip !== null) ? !!ov.flip : (targetSpeaker.portraits && targetSpeaker.portraits[ov.portraitIdx || targetSpeaker.defaultPortraitIdx || 0] && !!targetSpeaker.portraits[ov.portraitIdx || targetSpeaker.defaultPortraitIdx || 0].flip);
        stageSlots[pos] = {
          speaker: targetSpeaker,
          imgURL: imgURL,
          flip: isFlip
        };
      }
    }

    ['left', 'center', 'right'].forEach(pos => {
      const posKey = capitalize(pos);
      const slot = document.getElementById('portrait' + posKey);
      const imgEl = document.getElementById('portrait' + posKey + 'Img');
      const data = stageSlots[pos];

      if (data && data.imgURL) {
        imgEl.src = data.imgURL;
        applySpeakerTransform(slot, imgEl, data.speaker, data.flip);
        slot.classList.add('active');
        if (activeSpeakerName && data.speaker.name === activeSpeakerName) {
          slot.classList.remove('dimmed');
        } else {
          slot.classList.add('dimmed');
        }
      } else {
        slot.classList.remove('active');
        slot.classList.remove('dimmed');
        slot.style.left = '';
        slot.style.right = '';
        slot.style.transform = '';
        imgEl.style.transform = '';
        imgEl.removeAttribute('src');
      }
    });
  }

  return {
    capitalize,
    repeatSuffixSafe,
    actionDisplayText,
    displayTextFor,
    resolvePortraitURL,
    resolveBackgroundURL,
    applySpeakerTransform,
    applyTextStyle,
    resetStageSlots,
    renderStage
  };
})();