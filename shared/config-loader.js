/* ===== config-loader.js =====
   1) config.json 로드
   2) /api/settings 에서 글로벌 설정 읽기 (Notion 저장, 크로스 디바이스 동기화)
   3) localStorage 최종 override (오프라인 폴백)
   4) CSS 변수 주입 + 타이틀바 텍스트 세팅
*/

async function loadWidgetConfig() {
  const res = await fetch('./config.json');
  const config = await res.json();

  const root = document.documentElement.style;

  /* config.json 기본값 적용 */
  if (config.color)  root.setProperty('--win-color', config.color);
  if (config.accent) root.setProperty('--accent',    config.accent);
  if (config.font)   root.setProperty('--font',      config.font);

  /* Notion 글로벌 설정 (크로스 디바이스) */
  try {
    const sr = await fetch('/api/settings');
    if (sr.ok) {
      const s = await sr.json();
      _applySettings(root, s);
      /* 최신값을 localStorage에도 캐시 */
      localStorage.setItem('wg_settings', JSON.stringify(s));
    }
  } catch (e) {
    /* 오프라인 or 에러 → localStorage 폴백 */
    try {
      const s = JSON.parse(localStorage.getItem('wg_settings') || 'null');
      if (s) _applySettings(root, s);
    } catch (_) {}
  }

  if (config.title) {
    document.title = config.title;
    const titleEl = document.querySelector('[data-widget-title]');
    if (titleEl) titleEl.textContent = config.title;
  }

  return config;
}

function _applySettings(root, s) {
  if (s.theme) {
    const t = s.theme;
    if (t.winColor)  root.setProperty('--win-color',    t.winColor);
    if (t.accent)    root.setProperty('--accent',       t.accent);
    if (t.windowBg)  root.setProperty('--window-bg',    t.windowBg);
    if (t.ink)       root.setProperty('--ink',          t.ink);
  }
  if (s.titlebar) {
    const tb = s.titlebar;
    if (tb.fontSize) root.setProperty('--tb-fontsize',   tb.fontSize + 'px');
    if (tb.height)   root.setProperty('--tb-min-height', tb.height   + 'px');
  }
}
