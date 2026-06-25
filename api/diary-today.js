const DIARY_DB_ID = '37451f4140c5808e9141c8804e892661';
const HEADERS = {
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

function todayStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  if (now.getHours() < 5) now.setDate(now.getDate() - 1);
  return now.toLocaleDateString('sv-SE');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const today = todayStr();

  const r = await fetch(`https://api.notion.com/v1/databases/${DIARY_DB_ID}/query`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      filter: {
        property: '날짜',
        date: { equals: today },
      },
      page_size: 1,
    }),
  });

  const d = await r.json();
  if (d.object === 'error') return res.status(500).json({ error: d.message });

  const page = d.results?.[0];
  if (!page) return res.status(404).json({ error: `${today} 페이지 없음` });

  const url = `https://www.notion.so/${page.id.replace(/-/g, '')}`;
  return res.status(200).json({ url, date: today });
}
