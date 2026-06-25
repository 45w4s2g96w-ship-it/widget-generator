/* ===== config-loader.js =====
   1) config.json 기본값
   2) /api/settings 글로벌 설정 (테마, 타이틀바)
   3) /api/get-settings?widgetId=X 위젯별 override (색상, 폰트, 타이틀)
   4) CSS 변수 주입 + 타이틀바 텍스트 세팅
*/

async function loadWidgetConfig() {
  const res = await fetch('./config.json');
  const config = await res.json();
  const root = document.documentElement.style;

  /* 1. config.json 기본값 */
  if (config.color)  root.setProperty('--win-color', config.color);
  if (config.accent) root.setProperty('--accent',    config.accent);
  if (config.font)   root.setProperty('--font',      config.font);

  /* 2. 글로벌 설정 (크로스 디바이스, Notion 저장) */
  let globalS = null;
  try {
    const sr = await fetch('/api/settings');
    if (sr.ok) {
      globalS = await sr.json();
      _applyGlobal(root, globalS);
      localStorage.setItem('wg_settings', JSON.stringify(globalS));
    }
  } catch {
    try {
      const l = JSON.parse(localStorage.getItem('wg_settings') || 'null');
      if (l) { globalS = l; _applyGlobal(root, l); }
    } catch {}
  }

  /* 3. 위젯별 override (per-widget Notion DB row) */
  if (config.id) {
    try {
      const wr = await fetch(`/api/get-settings?widgetId=${config.id}`);
      if (wr.ok) {
        const ws = await wr.json();
        if (ws.color)  root.setProperty('--win-color', ws.color);
        if (ws.accent) root.setProperty('--accent',    ws.accent);
        if (ws.font)   root.setProperty('--font',      ws.font);
        if (ws.title) {
          document.title = ws.title;
          const el = document.querySelector('[data-widget-title]');
          if (el) el.textContent = ws.title;
        }
      }
    } catch {}
  }

  /* 타이틀 기본 세팅 (per-widget override 없을 때) */
  if (config.title) {
    document.title = config.title;
    const el = document.querySelector('[data-widget-title]');
    if (el && !el.textContent.trim()) el.textContent = config.title;
  }

  return config;
}

function _applyGlobal(root, s) {
  if (s.theme) {
    const t = s.theme;
    if (t.winColor)  root.setProperty('--win-color',  t.winColor);
    if (t.accent)    root.setProperty('--accent',      t.accent);
    if (t.windowBg)  root.setProperty('--window-bg',  t.windowBg);
    if (t.ink)       root.setProperty('--ink',         t.ink);
  }
  if (s.titlebar) {
    const tb = s.titlebar;
    if (tb.fontSize) root.setProperty('--tb-fontsize',   tb.fontSize + 'px');
    if (tb.height)   root.setProperty('--tb-min-height', tb.height   + 'px');
  }
}
