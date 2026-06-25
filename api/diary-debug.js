const DIARY_DB_ID = '37451f4140c5808e9141c8804e892661';
const HEADERS = {
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const seoulHour = now.getHours();
  const rawDate = now.toLocaleDateString('sv-SE');
  const cutoffDate = seoulHour < 5
    ? new Date(now.getTime() - 86400000).toLocaleDateString('sv-SE')
    : rawDate;

  // DB 스키마 조회
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${DIARY_DB_ID}`, { headers: HEADERS });
  const db = await dbRes.json();

  // 최근 5개 항목 조회 (필터 없이)
  const qRes = await fetch(`https://api.notion.com/v1/databases/${DIARY_DB_ID}/query`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ page_size: 5 }),
  });
  const qData = await qRes.json();

  const entries = (qData.results || []).map(p => {
    const dateProps = Object.entries(p.properties)
      .filter(([, v]) => v.type === 'date')
      .map(([k, v]) => ({ key: k, value: v.date }));
    return { id: p.id, dateProps };
  });

  res.status(200).json({
    seoulNow: now.toISOString(),
    seoulHour,
    rawDate,
    cutoffDate,
    dbError: db.object === 'error' ? db.message : null,
    propNames: Object.entries(db.properties || {}).map(([k, v]) => ({ name: k, type: v.type })),
    recentEntries: entries,
  });
}
