const HEADERS = {
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

export default async function handler(req, res) {
  // GET — list memos, optionally filtered by folder
  if (req.method === 'GET') {
    const { source_db_id, folder, cursor } = req.query;
    if (!source_db_id) return res.status(400).json({ error: 'source_db_id required' });

    let filter;
    if (folder === '★') {
      filter = { property: '중요', checkbox: { equals: true } };
    } else if (folder && folder !== 'ALL') {
      filter = { property: '분류', select: { equals: folder } };
    }

    const body = {
      sorts: [{ property: '생성일시', direction: 'descending' }],
      page_size: 50,
    };
    if (filter) body.filter = filter;
    if (cursor) body.start_cursor = cursor;

    try {
      const r = await fetch(`https://api.notion.com/v1/databases/${source_db_id}/query`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (data.object === 'error') throw new Error(data.message);

      const memos = data.results.map(page => ({
        id: page.id,
        text: page.properties['제목']?.title?.[0]?.plain_text || '',
        category: page.properties['분류']?.select?.name || null,
        important: page.properties['중요']?.checkbox || false,
        done: page.properties['처리완료']?.checkbox || false,
        createdAt: page.properties['생성일시']?.date?.start || null,
      }));

      return res.status(200).json({ memos, hasMore: data.has_more, nextCursor: data.next_cursor });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — create memo(s), auto-split numbered lists
  if (req.method === 'POST') {
    const { source_db_id, text } = req.body;
    if (!source_db_id || !text) return res.status(400).json({ error: 'source_db_id, text required' });

    const trimmed = text.trim();
    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
    const isNumberedList = lines.length > 1 && lines.every(l => /^\d+\.\s+/.test(l));
    const items = isNumberedList
      ? lines.map(l => l.replace(/^\d+\.\s+/, ''))
      : [trimmed];

    const now = new Date().toISOString();

    try {
      const created = [];
      for (const item of items) {
        const r = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({
            parent: { database_id: source_db_id },
            properties: {
              '제목': { title: [{ text: { content: item } }] },
              '생성일시': { date: { start: now } },
            },
          }),
        });
        const page = await r.json();
        if (page.object === 'error') throw new Error(page.message);
        created.push({
          id: page.id,
          text: item,
          category: null,
          important: false,
          done: false,
          createdAt: now,
        });
      }
      return res.status(200).json({ created });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH — update memo properties
  if (req.method === 'PATCH') {
    const { pageId, category, important, done } = req.body;
    if (!pageId) return res.status(400).json({ error: 'pageId required' });

    const properties = {};
    if (category !== undefined) {
      properties['분류'] = category ? { select: { name: category } } : { select: null };
    }
    if (important !== undefined) properties['중요'] = { checkbox: important };
    if (done !== undefined) properties['처리완료'] = { checkbox: done };

    try {
      const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({ properties }),
      });
      const data = await r.json();
      if (data.object === 'error') throw new Error(data.message);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE — archive memos
  if (req.method === 'DELETE') {
    const { pageIds } = req.body;
    if (!pageIds || !Array.isArray(pageIds)) return res.status(400).json({ error: 'pageIds required' });

    try {
      await Promise.all(pageIds.map(id =>
        fetch(`https://api.notion.com/v1/pages/${id}`, {
          method: 'PATCH',
          headers: HEADERS,
          body: JSON.stringify({ archived: true }),
        })
      ));
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
