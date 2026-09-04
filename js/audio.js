const AudioModule = (function () {

  let globalSfxVolume = 0.9;

  function getEffectiveBgm(idx, script, lineOverrides, defaultBgmURL, defaultBgmName) {
    for (let i = idx; i >= 0; i--) {
      const l = script[i];
      const ov = lineOverrides[l.key];
      if (ov) {
        if (ov.bgmAction === 'stop') return null;
        if (ov.bgmAction === 'set' && ov.bgmURL) return { key: 'line_' + i + '_' + ov.bgmName, url: ov.bgmURL };
      }
    }
    return defaultBgmURL ? { key: 'default_' + defaultBgmName, url: defaultBgmURL } : null;
  }

  function updateBgmForLine(idx, state) {
    const eff = getEffectiveBgm(idx, state.script, state.lineOverrides, state.defaultBgmURL, state.defaultBgmName);
    const audio = document.getElementById('bgmAudio');
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

  function setGlobalSfxVolume(val) {
    globalSfxVolume = Math.max(0, Math.min(1, val));
  }

  function getGlobalSfxVolume() {
    return globalSfxVolume;
  }

  function playSfx(url, volume) {
    if (!url) return;
    const sfx = new Audio(url);
    const v = volume !== undefined && volume !== null ? volume : globalSfxVolume;
    sfx.volume = Math.max(0, Math.min(1, v));
    sfx.play().catch(() => {});
  }

  function stopBgm(state) {
    const audio = document.getElementById('bgmAudio');
    audio.pause();
    state.currentBgmKey = null;
  }

  return {
    getEffectiveBgm,
    updateBgmForLine,
    setGlobalSfxVolume,
    getGlobalSfxVolume,
    playSfx,
    stopBgm
  };
})();