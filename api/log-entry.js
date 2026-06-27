export default async function handler(req, res) {
  const headers = {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // 오전 5시 기준 — 5시 이전이면 어제 날짜로 처리
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

  async function getAllBlocks(blockId) {
    const blocks = [];
    let cursor;
    do {
      const params = new URLSearchParams({ page_size: '100' });
      if (cursor) params.set('start_cursor', cursor);
      const r = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children?${params}`, { headers });
      const data = await r.json();
      if (data.object === 'error') throw new Error(data.message);
      blocks.push(...(data.results || []));
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    return blocks;
  }

  function plainText(block) {
    const t = block.type;
    return (block[t]?.rich_text || []).map(r => r.plain_text || r.text?.content || '').join('');
  }

  // '기록' heading 이후 ~ '일기' heading 직전까지 탐색
  // afterBlockId: 새 블록을 삽입할 위치 (직전 블록 ID)
  // entries: 해당 구간의 paragraph 블록들
  function findGirokSection(blocks) {
    // 1. '기록' heading_4 (not toggleable) 찾기
    let startIdx = -1;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type === 'heading_4' && !b.heading_4?.is_toggleable && plainText(b).includes('기록')) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) return { afterBlockId: null, entries: [] };

    let afterBlockId = blocks[startIdx].id;
    const entries = [];

    for (let i = startIdx + 1; i < blocks.length; i++) {
      const b = blocks[i];

      // '일기' heading_4 → 중단
      if (b.type === 'heading_4' && plainText(b).includes('일기')) break;

      // divider + 다음 블록이 '일기' heading → 중단
      if (b.type === 'divider') {
        const next = blocks[i + 1];
        if (next && next.type === 'heading_4' && plainText(next).includes('일기')) break;
      }

      afterBlockId = b.id;

      // paragraph 엔트리 수집
      if (b.type === 'paragraph') {
        const rich = b.paragraph?.rich_text || [];
        if (rich.length >= 2) {
          const time = (rich[0]?.plain_text || rich[0]?.text?.content || '').trim();
          const body = rich.slice(1).map(r => r.plain_text || r.text?.content || '').join('').replace(/^\n/, '');
          if (time && body) entries.push({ time, text: body, blockId: b.id.replace(/-/g, '') });
        }
      }
    }

    return { afterBlockId, entries };
  }

  // GET — 오늘 '기록' 섹션 paragraph 목록 반환
  if (req.method === 'GET') {
    const { source_db_id, source_property } = req.query;
    if (!source_db_id || !source_property)
      return res.status(400).json({ error: 'source_db_id, source_property required' });

    try {
      const pageId = await getTodayPageId(source_db_id, source_property);
      if (!pageId) return res.status(200).json({ entries: [] });

      const blocks = await getAllBlocks(pageId);
      const pageIdClean = pageId.replace(/-/g, '');
      const { entries } = findGirokSection(blocks);

      return res.status(200).json({
        entries: entries.map(e => ({ ...e, pageId: pageIdClean })),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — '기록' 섹션 적절한 위치에 paragraph 삽입
  if (req.method === 'POST') {
    const { source_db_id, source_property, time, text } = req.body;
    if (!source_db_id || !source_property || !text)
      return res.status(400).json({ error: 'source_db_id, source_property, text required' });

    try {
      const pageId = await getTodayPageId(source_db_id, source_property);
      if (!pageId)
        return res.status(404).json({ error: '오늘 날짜의 Notion 페이지가 없습니다.' });

      const blocks = await getAllBlocks(pageId);
      const { afterBlockId } = findGirokSection(blocks);
      if (!afterBlockId)
        return res.status(404).json({ error: "페이지에서 '기록' 섹션을 찾을 수 없습니다." });

      const body = {
        after: afterBlockId,
        children: [{
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: time }, annotations: { color: 'gray' } },
              { type: 'text', text: { content: '\n' + text }, annotations: { color: 'default' } },
            ],
            color: 'default',
          },
        }],
      };

      const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
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
