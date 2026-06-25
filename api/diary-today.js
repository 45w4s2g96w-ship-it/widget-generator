const DIARY_DB_ID = '37451f4140c5808e9141c8804e892661';
const HEADERS = {
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

/* 서울 5시 컷오프 기준 오늘/내일 날짜 */
function getDateRange() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  if (now.getHours() < 5) now.setDate(now.getDate() - 1);
  const today = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD
  now.setDate(now.getDate() + 1);
  const tomorrow = now.toLocaleDateString('sv-SE');
  return { today, tomorrow };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { today, tomorrow } = getDateRange();

  /* DB 스키마에서 날짜 타입 프로퍼티명 자동 감지 */
  let dateProp = '날짜';
  try {
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${DIARY_DB_ID}`, { headers: HEADERS });
    const db = await dbRes.json();
    const found = Object.entries(db.properties || {}).find(([, v]) => v.type === 'date');
    if (found) dateProp = found[0];
  } catch {}

  /* today <= date < tomorrow 범위로 검색 (equals보다 안정적) */
  const r = await fetch(`https://api.notion.com/v1/databases/${DIARY_DB_ID}/query`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      filter: {
        and: [
          { property: dateProp, date: { on_or_after: today } },
          { property: dateProp, date: { before: tomorrow } },
        ],
      },
      sorts: [{ property: dateProp, direction: 'descending' }],
      page_size: 1,
    }),
  });

  const d = await r.json();
  if (d.object === 'error') return res.status(500).json({ error: d.message });

  const page = d.results?.[0];
  if (!page) return res.status(404).json({ error: `${today} 다이어리 없음`, dateProp, today });

  const url = `https://www.notion.so/${page.id.replace(/-/g, '')}`;
  return res.status(200).json({ url, date: today });
}
