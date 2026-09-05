const CHANGELOG_DATA = [
    {
    version: "v1.1.3",
    date: "2026-09-05",
    logs: [
      "程式碼結構重構",
      "修正匯出html時立繪不亮"
    ]
  },
  {
    version: "v1.1.2",
    date: "2026-09-04",
    logs: [
      "修正背景不連續問題"
    ]
  },
  {
    version: "v1.1.1",
    date: "2026-09-04",
    logs: [
      "修正無法載入已處理完的log問題"
    ]
  },
  {
    version: "v1.1.0",
    date: "2026-09-04",
    logs: [
      "我們有酷酷的log播放器了"
    ]
  },
];

(function () {
  function renderChangelog() {
    const list = document.getElementById('changelogList');
    if (!list) return;

    list.innerHTML = CHANGELOG_DATA.map(item => `
      <div class="changelog-item">
        <div class="changelog-header">
          <span class="changelog-ver">${item.version}</span>
          <span class="changelog-date">${item.date}</span>
        </div>
        <ul class="changelog-entries">
          ${item.logs.map(log => `<li>${log}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderChangelog);
  } else {
    renderChangelog();
  }
})();