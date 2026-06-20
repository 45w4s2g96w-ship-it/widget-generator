# Widget Generator — 개발 지침

## 디렉토리 구조

```
widgets/[id]/
  index.html    # 위젯 UI
  config.json   # 위젯 설정

shared/
  tokens.css        # 공통 디자인 토큰 (CSS 변수)
  config-loader.js  # config.json + Notion 설정 로더

api/
  [name].js     # Vercel serverless 함수
```

## 위젯 HTML 기본 구조

```html
<link rel="stylesheet" href="../../shared/tokens.css" />

<div class="window">
  <div class="titlebar">
    <span data-widget-title>C:// TITLE</span>
    <span style="opacity:0.75;cursor:default">⚙</span>  <!-- 설정 이모지만 -->
  </div>
  <div class="content">
    <!-- 위젯 내용 -->
  </div>
</div>

<script src="../../shared/config-loader.js"></script>
<script>
  loadWidgetConfig(); // CSS 변수 주입 + 타이틀 설정
</script>
```

## 디자인 규칙

### 타이틀바 우측
- **설정 이모지(⚙)만** 표시한다.
- `_`, `□`, `×` 같은 윈도우 콘트롤 아이콘은 넣지 않는다.

```html
<!-- ✅ 올바른 방식 -->
<span style="opacity:0.75;cursor:default">⚙</span>

<!-- ❌ 사용하지 않음 -->
<div class="icons"><span>_</span><span>□</span><span>×</span></div>
```

### 버튼 스타일
- **모든 버튼은 `var(--accent)` (보라색) 배경**으로 한다.
- 하얀 텍스트, accent 색상 border.
- hover는 `filter: brightness(1.1)`, active는 `filter: brightness(0.9)`.
- disabled는 `opacity: 0.45`.

```css
.btn, button {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  font-family: var(--font);
  font-size: 10.5px;
  padding: 4px 10px;
  cursor: pointer;
}
button:hover { filter: brightness(1.1); }
button:active { filter: brightness(0.9); }
button:disabled { opacity: 0.45; cursor: default; filter: none; }
```

### 색상 / 폰트
- CSS 변수(`--win-color`, `--accent`, `--font`)는 `config-loader.js`가 `config.json` 값으로 주입한다.
- 하드코딩 금지. 항상 `var(--accent)` 등 토큰 사용.

## config.json 필드

| 필드 | 설명 |
|---|---|
| `id` | 위젯 고유 ID (디렉토리명과 동일) |
| `title` | 타이틀바에 표시될 이름 |
| `color` | 타이틀바 배경색 (`--win-color`) |
| `accent` | 강조색 (`--accent`) |
| `font` | 폰트 (`--font`) |
| `type` | 위젯 종류 (`clock` / `habit` / `textinput` / `report`) |
| `source_db_id` | Notion DB ID |
| `source_property` | Notion 날짜 필터 프로퍼티명 (기본값: `날짜`) |
| `mode` | `live` = Notion 설정 DB에서 실시간 override |

## API 함수 규칙

- Vercel serverless (`export default async function handler(req, res)`)
- Notion 토큰: `process.env.NOTION_TOKEN`
- Notion API 버전: `2022-06-28`
- 날짜 기준: **오전 5시 컷오프** — 5시 이전이면 어제 날짜로 처리

```js
const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
if (now.getHours() < 5) now.setDate(now.getDate() - 1);
const today = now.toLocaleDateString('sv-SE');
```
