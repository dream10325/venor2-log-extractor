const StageModule = (function () {

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

  function resolvePortraitURL(sp, ov) {
    if (!sp || !sp.portraits || sp.portraits.length === 0) return null;
    if (ov && ov.portraitIdx !== undefined && ov.portraitIdx !== null && sp.portraits[ov.portraitIdx]) {
      return sp.portraits[ov.portraitIdx].url;
    }
    const defIdx = sp.defaultPortraitIdx || 0;
    return sp.portraits[defIdx] ? sp.portraits[defIdx].url : sp.portraits[0].url;
  }

  function resolveBackgroundURL(ov, defaultBgURL) {
    return (ov && ov.bgURL) || defaultBgURL || null;
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

  function renderStage(line, ov, sp, defaultBgURL) {
    const vnBox = document.getElementById('vnBox');
    const stageBg = document.getElementById('stageBg');

    ['Left', 'Center', 'Right'].forEach(pos => {
      const slot = document.getElementById('portrait' + pos);
      slot.classList.remove('active');
      slot.style.left = '';
      slot.style.right = '';
      slot.style.transform = '';
    });

    const bgURL = resolveBackgroundURL(ov, defaultBgURL);
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

    if (line.type === 'chat') {
      vnBox.classList.remove('narration');
      document.getElementById('vnName').textContent = sp.displayName;
      vnBox.style.setProperty('--vn-name-color', sp.color);

      const imgURL = resolvePortraitURL(sp, ov);
      const posKey = capitalize(sp.position);
      const slot = document.getElementById('portrait' + posKey);
      if (imgURL) {
        document.getElementById('portrait' + posKey + 'Img').src = imgURL;
        applySpeakerTransform(slot, sp);
        slot.classList.add('active');
      }
    } else {
      vnBox.classList.add('narration');
      document.getElementById('vnName').textContent = '';
      const imgURL = resolvePortraitURL(sp, ov);
      if (sp && imgURL) {
        const posKey = capitalize(sp.position);
        const slot = document.getElementById('portrait' + posKey);
        document.getElementById('portrait' + posKey + 'Img').src = imgURL;
        applySpeakerTransform(slot, sp);
        slot.classList.add('active');
      }
    }
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
    renderStage
  };
})();