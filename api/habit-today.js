const NOTION_HEADERS = {
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

const GROUP_ORDER = ['morning', 'day', 'night'];

function getToday() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  if (now.getHours() < 5) now.setDate(now.getDate() - 1);
  return now.toLocaleDateString('sv-SE');
}

function norm(id) { return id ? id.replace(/-/g, '') : ''; }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const today = getToday();

  // GET — 오늘 활성 습관 목록 + 완료 여부
  if (req.method === 'GET') {
    const { habit_db_id, daily_db_id } = req.query;
    if (!habit_db_id || !daily_db_id)
      return res.status(400).json({ error: 'habit_db_id, daily_db_id required' });

    try {
      // 오늘의 Daily 페이지 ID 조회
      const dr = await fetch(`https://api.notion.com/v1/databases/${daily_db_id}/query`, {
        method: 'POST',
        headers: NOTION_HEADERS,
        body: JSON.stringify({ filter: { property: '날짜', date: { equals: today } } }),
      });
      const dd = await dr.json();
      if (dd.object === 'error') throw new Error(dd.message);
      const todayDailyPageId = dd.results?.[0]?.id || null;
      const todayNorm = norm(todayDailyPageId);

      // 활성 습관 전체 조회 (페이지네이션)
      const habits = [];
      let cursor;
      do {
        const r = await fetch(`https://api.notion.com/v1/databases/${habit_db_id}/query`, {
          method: 'POST',
          headers: NOTION_HEADERS,
          body: JSON.stringify({
            filter: { property: '진행중인습관', checkbox: { equals: true } },
            ...(cursor ? { start_cursor: cursor } : {}),
          }),
        });
        const d = await r.json();
        if (d.object === 'error') throw new Error(d.message);
        habits.push(...(d.results || []));
        cursor = d.has_more ? d.next_cursor : undefined;
      } while (cursor);

      // 그룹별 분류
      const groups = Object.fromEntries(GROUP_ORDER.map(g => [g, []]));
      for (const page of habits) {
        const name = (page.properties['습관']?.title || [])
          .map(t => t.plain_text || t.text?.content || '').join('');
        const group = page.properties['구분']?.select?.name || 'day';
        const relation = page.properties['데일리']?.relation || [];
        const done = !!todayNorm && relation.some(r => norm(r.id) === todayNorm);
        if (!groups[group]) groups[group] = [];
        groups[group].push({ id: page.id, name, done });
      }

      // 미완료 먼저 정렬
      GROUP_ORDER.forEach(g => groups[g].sort((a, b) => +a.done - +b.done));

      return res.status(200).json({ today, todayDailyPageId, groups });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH — 습관 완료 토글
  if (req.method === 'PATCH') {
    const { habitPageId, todayDailyPageId, done } = req.body;
    if (!habitPageId || !todayDailyPageId)
      return res.status(400).json({ error: 'habitPageId, todayDailyPageId required' });

    try {
      const pr = await fetch(`https://api.notion.com/v1/pages/${habitPageId}`, { headers: NOTION_HEADERS });
      const page = await pr.json();
      if (page.object === 'error') throw new Error(page.message);

      const current = page.properties['데일리']?.relation || [];
      const todayNorm = norm(todayDailyPageId);
      const has = current.some(r => norm(r.id) === todayNorm);

      const newRelation = done
        ? (has ? current : [...current, { id: todayDailyPageId }])
        : current.filter(r => norm(r.id) !== todayNorm);

      const patch = await fetch(`https://api.notion.com/v1/pages/${habitPageId}`, {
        method: 'PATCH',
        headers: NOTION_HEADERS,
        body: JSON.stringify({ properties: { '데일리': { relation: newRelation } } }),
      });
      const pd = await patch.json();
      if (pd.object === 'error') throw new Error(pd.message);

      return res.status(200).json({ ok: true, done });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
