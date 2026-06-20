export default async function handler(req, res) {
  const headers = {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  function getToday() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    if (now.getHours() < 5) now.setDate(now.getDate() - 1);
    return now;
  }

  // GET — fetch todos with due dates (today / this week / this month)
  if (req.method === 'GET') {
    const { source_db_id } = req.query;
    if (!source_db_id) return res.status(400).json({ error: 'source_db_id required' });

    try {
      const now = getToday();
      const today = now.toLocaleDateString('sv-SE');
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toLocaleDateString('sv-SE');

      const results = [];
      let cursor = undefined;
      do {
        const body = {
          filter: {
            and: [
              { property: '마감일', date: { is_not_empty: true } },
              { property: '마감일', date: { on_or_before: endOfMonth } },
              { property: '마감일', date: { on_or_after: today } },
            ],
          },
          page_size: 100,
        };
        if (cursor) body.start_cursor = cursor;

        const r = await fetch(`https://api.notion.com/v1/databases/${source_db_id}/query`, {
          method: 'POST', headers, body: JSON.stringify(body),
        });
        const data = await r.json();
        if (data.object === 'error') throw new Error(data.message);
        results.push(...data.results);
        cursor = data.has_more ? data.next_cursor : undefined;
      } while (cursor);

      const pages = results.map(page => {
        const title = page.properties['이름']?.title?.[0]?.plain_text || '(제목 없음)';
        const dueProp = page.properties['마감일']?.date;
        const dueStart = dueProp?.start || null;
        const hasTime = dueStart ? dueStart.includes('T') : false;
        const done = page.properties['완료']?.checkbox || false;
        const parentIds = (page.properties['상위 항목']?.relation || []).map(r => r.id);
        const childIds = (page.properties['하위 항목']?.relation || []).map(r => r.id);

        return { id: page.id, title, dueStart, hasTime, done, parentIds, childIds };
      });

      return res.status(200).json({ pages, today });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH — update due date (pin click or edit modal save)
  if (req.method === 'PATCH') {
    const { pageId, dueDate, title } = req.body;
    if (!pageId) return res.status(400).json({ error: 'pageId required' });

    try {
      const props = {};
      if (dueDate !== undefined) props['마감일'] = { date: dueDate ? { start: dueDate } : null };
      if (title !== undefined) props['이름'] = { title: [{ text: { content: title } }] };

      const patchRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ properties: props }),
      });
      const data = await patchRes.json();
      if (data.object === 'error') throw new Error(data.message);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
