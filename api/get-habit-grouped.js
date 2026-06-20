export default async function handler(req, res) {
  const headers = {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  async function fetchDbOptions(dbId, property) {
    const r = await fetch(`https://api.notion.com/v1/databases/${dbId}`, { headers });
    const db = await r.json();
    if (db.object === 'error') throw new Error(db.message);
    return db.properties[property]?.multi_select?.options || [];
  }

  // GET — 오늘의 루틴 완료 현황을 그룹별로 반환
  if (req.method === 'GET') {
    const { source_db_id, source_property } = req.query;
    if (!source_db_id || !source_property) {
      return res.status(400).json({ error: 'source_db_id, source_property required' });
    }

    try {
      const allOptions = await fetchDbOptions(source_db_id, source_property);

      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
      const queryRes = await fetch(`https://api.notion.com/v1/databases/${source_db_id}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filter: { property: '날짜', date: { equals: today } } }),
      });
      const queryData = await queryRes.json();
      const page = queryData.results?.[0];
      const completedNames = page
        ? page.properties[source_property]?.multi_select?.map((o) => o.name) || []
        : [];

      // [그룹] 이름 형식으로 그룹 분류
      const groups = {};
      let total = 0;
      let completed = 0;

      allOptions.forEach((opt) => {
        const match = opt.name.match(/^\[(.+?)\]\s*/);
        const group = match ? match[1] : '기타';
        const displayName = match ? opt.name.slice(match[0].length) : opt.name;
        const done = completedNames.includes(opt.name);
        if (!groups[group]) groups[group] = [];
        groups[group].push({ name: displayName, fullName: opt.name, done, id: opt.id });
        total++;
        if (done) completed++;
      });

      return res.status(200).json({ groups, total, completed });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — Notion multi-select에 옵션 추가
  if (req.method === 'POST') {
    const { source_db_id, source_property, name, group } = req.body;
    if (!source_db_id || !source_property || !name) {
      return res.status(400).json({ error: 'source_db_id, source_property, name required' });
    }

    try {
      const currentOptions = await fetchDbOptions(source_db_id, source_property);
      const fullName = group ? `[${group}] ${name}` : name;

      if (currentOptions.some((o) => o.name === fullName)) {
        return res.status(400).json({ error: '이미 존재하는 항목입니다.' });
      }

      const patchRes = await fetch(`https://api.notion.com/v1/databases/${source_db_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          properties: {
            [source_property]: {
              multi_select: {
                options: [
                  ...currentOptions.map((o) => ({ id: o.id, name: o.name, color: o.color })),
                  { name: fullName },
                ],
              },
            },
          },
        }),
      });
      const patchData = await patchRes.json();
      if (patchData.object === 'error') throw new Error(patchData.message);

      return res.status(200).json({ ok: true, fullName });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE — Notion multi-select에서 옵션 제거
  if (req.method === 'DELETE') {
    const { source_db_id, source_property, fullName } = req.body;
    if (!source_db_id || !source_property || !fullName) {
      return res.status(400).json({ error: 'source_db_id, source_property, fullName required' });
    }

    try {
      const currentOptions = await fetchDbOptions(source_db_id, source_property);
      const filtered = currentOptions
        .filter((o) => o.name !== fullName)
        .map((o) => ({ id: o.id, name: o.name, color: o.color }));

      const patchRes = await fetch(`https://api.notion.com/v1/databases/${source_db_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          properties: {
            [source_property]: {
              multi_select: { options: filtered },
            },
          },
        }),
      });
      const patchData = await patchRes.json();
      if (patchData.object === 'error') throw new Error(patchData.message);

      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
