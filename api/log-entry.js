export default async function handler(req, res) {
  const headers = {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // 오전 5시 기준 — 5시 이전이면 어제 날짜로 기록
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  if (now.getHours() < 5) now.setDate(now.getDate() - 1);
  const today = now.toLocaleDateString('sv-SE');

  async function getTodayPageId(source_db_id, source_property) {
    const r = await fetch(`https://api.notion.com/v1/databases/${source_db_id}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filter: { property: source_property, date: { equals: today } },
      }),
    });
    const data = await r.json();
    if (data.object === 'error') throw new Error(data.message);
    return data.results?.[0]?.id || null;
  }

  // GET — 오늘 페이지의 quote 블록 목록 반환
  if (req.method === 'GET') {
    const { source_db_id, source_property } = req.query;
    if (!source_db_id || !source_property)
      return res.status(400).json({ error: 'source_db_id, source_property required' });

    try {
      const pageId = await getTodayPageId(source_db_id, source_property);
      if (!pageId) return res.status(200).json({ entries: [] });

      const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, { headers });
      const data = await r.json();
      if (data.object === 'error') throw new Error(data.message);

      const pageIdClean = pageId.replace(/-/g, '');
      const entries = [];
      for (const block of data.results || []) {
        if (block.type !== 'quote') continue;
        const rich = block.quote?.rich_text || [];
        if (rich.length < 2) continue;

        const time = rich[0]?.text?.content?.trim() || '';
        const bodyPart = rich.slice(1).map(r => r.text?.content || '').join('');
        const text = bodyPart.replace(/^\n/, '');
        const blockId = block.id.replace(/-/g, '');
        if (time && text) entries.push({ time, text, pageId: pageIdClean, blockId });
      }

      return res.status(200).json({ entries });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — 오늘 페이지에 quote 블록 추가
  if (req.method === 'POST') {
    const { source_db_id, source_property, time, text } = req.body;
    if (!source_db_id || !source_property || !text)
      return res.status(400).json({ error: 'source_db_id, source_property, text required' });

    try {
      const pageId = await getTodayPageId(source_db_id, source_property);
      if (!pageId)
        return res.status(404).json({ error: '오늘 날짜의 Notion 페이지가 없습니다.' });

      const rich_text = [
        { type: 'text', text: { content: time }, annotations: { color: 'gray' } },
        { type: 'text', text: { content: '\n' + text } },
      ];

      const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          children: [{ object: 'block', type: 'quote', quote: { rich_text, color: 'default' } }],
        }),
      });
      const data = await r.json();
      if (data.object === 'error') throw new Error(data.message);

      return res.status(200).json({ ok: true, time, text });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
