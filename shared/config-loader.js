/* ===== config-loader.js =====
   1) config.json 로드
   2) Notion Settings DB에서 live override (mode:live인 경우)
   3) localStorage (settings 페이지 저장값) 최종 override
   4) CSS 변수 주입 + 타이틀바 텍스트 세팅
*/

async function loadWidgetConfig() {
  const res = await fetch('./config.json');
  const config = await res.json();

  try {
    const liveRes = await fetch(`/api/get-settings?widgetId=${config.id}`);
    if (liveRes.ok) {
      const live = await liveRes.json();
      Object.assign(config, live);
    }
  } catch (e) {
    console.warn('Settings DB 연결 실패 — 기본값(config.json)으로 표시됨');
  }

  const root = document.documentElement.style;
  if (config.color)  root.setProperty('--win-color', config.color);
  if (config.accent) root.setProperty('--accent',    config.accent);
  if (config.font)   root.setProperty('--font',      config.font);

  /* localStorage 글로벌 설정 override */
  try {
    const stored = JSON.parse(localStorage.getItem('wg_settings') || 'null');
    if (stored?.theme) {
      const t = stored.theme;
      if (t.winColor)  root.setProperty('--win-color',   t.winColor);
      if (t.accent)    root.setProperty('--accent',      t.accent);
      if (t.windowBg)  root.setProperty('--window-bg',   t.windowBg);
      if (t.ink)       root.setProperty('--ink',         t.ink);
    }
    if (stored?.titlebar) {
      const tb = stored.titlebar;
      if (tb.fontSize) root.setProperty('--tb-fontsize',   tb.fontSize + 'px');
      if (tb.height)   root.setProperty('--tb-min-height', tb.height   + 'px');
    }
  } catch(e) {}

  if (config.title) {
    document.title = config.title;
    const titleEl = document.querySelector('[data-widget-title]');
    if (titleEl) titleEl.textContent = config.title;
  }

  return config;
}
