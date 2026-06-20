export default async function handler(req, res) {
  const headers = {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  function getSeoulNow() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    if (now.getHours() < 5) now.setDate(now.getDate() - 1);
    return now;
  }

  function calcQuadrant(dueDateStr, todayStr, endOfWeekStr, cfg) {
    if (!dueDateStr) return null;
    const d = dueDateStr.slice(0, 10);
    if (d === todayStr) return cfg.quadrant_today || '1사분면';
    if (d <= endOfWeekStr) return cfg.quadrant_week || '2사분면';
    return null;
  }

  if (req.method === 'GET') {
    const { source_db_id } = req.query;
    if (!source_db_id) return res.status(400).json({ error: 'source_db_id required' });

    try {
      const now = getSeoulNow();
      const today = now.toLocaleDateString('sv-SE');
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() + 6);
      const endOfWeek = weekEnd.toLocaleDateString('sv-SE');

      const results = [];
      let cursor;
      do {
        const body = {
          filter: {
            and: [
              { property: '마감일', date: { is_not_empty: true } },
              { property: '마감일', date: { on_or_after: today } },
              { property: '마감일', date: { on_or_before: endOfWeek } },
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

      const pages = results.map(page => ({
        id: page.id,
        title: page.properties['이름']?.title?.[0]?.plain_text || '(제목 없음)',
        dueStart: page.properties['마감일']?.date?.start || null,
        hasTime: !!(page.properties['마감일']?.date?.start?.includes('T')),
        done: page.properties['완료']?.checkbox || false,
        memo: page.properties['메모']?.rich_text?.[0]?.plain_text || '',
      }));

      return res.status(200).json({ pages, today, endOfWeek });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { source_db_id, title, dueDate, memo, cfg } = req.body;
    if (!source_db_id || !title) return res.status(400).json({ error: 'source_db_id, title required' });

    try {
      const now = getSeoulNow();
      const today = now.toLocaleDateString('sv-SE');
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() + 6);
      const endOfWeek = weekEnd.toLocaleDateString('sv-SE');

      const props = {
        '이름': { title: [{ text: { content: title } }] },
        '완료': { checkbox: false },
        '추가일': { date: { start: today } },
      };
      if (dueDate) props['마감일'] = { date: { start: dueDate } };
      if (memo) props['메모'] = { rich_text: [{ text: { content: memo } }] };
      const quadrant = calcQuadrant(dueDate, today, endOfWeek, cfg || {});
      if (quadrant) props['사분면'] = { select: { name: quadrant } };

      const r = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers,
        body: JSON.stringify({ parent: { database_id: source_db_id }, properties: props }),
      });
      const data = await r.json();
      if (data.object === 'error') throw new Error(data.message);

      const newDue = data.properties['마감일']?.date?.start || null;
      return res.status(200).json({
        id: data.id, title,
        dueStart: newDue,
        hasTime: !!(newDue?.includes('T')),
        done: false,
        memo: memo || '',
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PATCH') {
    const { pageId, dueDate, title, done, memo, cfg } = req.body;
    if (!pageId) return res.status(400).json({ error: 'pageId required' });

    try {
      const now = getSeoulNow();
      const today = now.toLocaleDateString('sv-SE');
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() + 6);
      const endOfWeek = weekEnd.toLocaleDateString('sv-SE');

      const props = {};
      if (title !== undefined) props['이름'] = { title: [{ text: { content: title } }] };
      if (memo !== undefined) props['메모'] = { rich_text: memo ? [{ text: { content: memo } }] : [] };
      if (dueDate !== undefined) {
        props['마감일'] = { date: dueDate ? { start: dueDate } : null };
        const quadrant = calcQuadrant(dueDate, today, endOfWeek, cfg || {});
        if (quadrant) props['사분면'] = { select: { name: quadrant } };
      }
      if (done !== undefined) {
        props['완료'] = { checkbox: done };
        props['완료일'] = { date: done ? { start: today } : null };
      }

      const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ properties: props }),
      });
      const data = await r.json();
      if (data.object === 'error') throw new Error(data.message);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
