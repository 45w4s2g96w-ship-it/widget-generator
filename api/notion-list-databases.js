export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  const token = process.env.NOTION_TOKEN;
  const headers = { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' };

  try {
    // 1. 링크 자체가 데이터베이스인지 먼저 시도
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${id}`, { headers });
    if (dbRes.ok) {
      const db = await dbRes.json();
      const title = db.title?.[0]?.plain_text || '(제목 없음)';
      return res.status(200).json({ type: 'database', databases: [{ id, title }] });
    }

    // 2. 페이지라면, 하위 블록 중 child_database(인라인 DB)를 찾는다
    const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${id}/children?page_size=100`, { headers });
    const blocksData = await blocksRes.json();

    if (!blocksRes.ok) {
      return res.status(blocksRes.status).json({ error: blocksData.message || 'Notion에서 이 링크를 못 읽었어요. Integration이 이 페이지에 연결되어 있는지 확인해주세요.' });
    }

    const databases = (blocksData.results || [])
      .filter((b) => b.type === 'child_database')
      .map((b) => ({ id: b.id, title: b.child_database?.title || '(제목 없음)' }));

    res.status(200).json({ type: 'page', databases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
