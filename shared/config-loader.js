/* ===== config-loader.js =====
   생성기의 핵심: config.json 값을 읽어서
   1) CSS 변수(색/폰트)에 주입
   2) 타이틀바 텍스트 세팅
   3) config 객체를 위젯 스크립트에 반환 (notionDbId 등 위젯 로직에서 사용)
*/

async function loadWidgetConfig() {
  const res = await fetch('./config.json');
  const config = await res.json();

  // Notion Settings DB에 저장된 최신 값이 있으면 덮어쓴다 (없으면 config.json 기본값 사용)
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
  if (config.accent) root.setProperty('--accent', config.accent);
  if (config.font)   root.setProperty('--font', config.font);

  if (config.title) {
    document.title = config.title;
    const titleEl = document.querySelector('[data-widget-title]');
    if (titleEl) titleEl.textContent = config.title;
  }

  return config;
}
