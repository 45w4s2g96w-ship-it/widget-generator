const BASE_URL = 'https://widget-generator-theta.vercel.app';

const WIDGETS = [
  { id:'clock',        title:'C:// CLOCK',         color:'#111111', accent:'#9b8fc7', font:"'Montserrat', sans-serif", type:'clock' },
  { id:'flipclock',    title:'C:// FLIP CLOCK',    color:'#111111', accent:'#9b8fc7', font:"'Montserrat', sans-serif", type:'clock' },
  { id:'folders',      title:'C:// FOLDERS',       color:'#1a1a1a', accent:'#9b8fc7', font:"'ChosunGu'",              type:'folders' },
  { id:'habittracker', title:'C:// HABIT TRACKER', color:'#1a1a1a', accent:'#9b8fc7', font:"'ChosunGu'",              type:'habit' },
  { id:'log',          title:'C:// LOG',            color:'#1a1a1a', accent:'#9b8fc7', font:"'ChosunGu'",              type:'textinput' },
  { id:'memo',         title:'C:// MEMO',           color:'#1a1a1a', accent:'#9b8fc7', font:"'ChosunGu'",              type:'memo' },
  { id:'to-do',        title:'C:// TO-DO',          color:'#1a1a1a', accent:'#9b8fc7', font:"'ChosunGu'",              type:'report' },
  { id:'braindump',    title:'C:// BRAINDUMP',      color:'#1a1a1a', accent:'#9b8fc7', font:"'ChosunGu'",              type:'braindump' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.NOTION_TOKEN;
  const dbId  = process.env.SETTINGS_DB_ID;
  const H = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // GET: 현재 DB 상태 확인
  if (req.method === 'GET') {
    try {
      const dbRes = await fetch(`https://api.notion.com/v1/databases/${dbId}`, { headers: H });
      const db = await dbRes.json();
      const titleKey = Object.keys(db.properties).find(k => db.properties[k].type === 'title');
      const qRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST', headers: H, body: JSON.stringify({ page_size: 100 }),
      });
      const qData = await qRes.json();
      const existingIds = (qData.results || [])
        .map(p => p.properties[titleKey]?.title?.[0]?.plain_text).filter(Boolean);
      return res.status(200).json({
        hasEmbedLink: !!db.properties.embed_link,
        existingWidgets: existingIds,
        missingWidgets: WIDGETS.map(w => w.id).filter(id => !existingIds.includes(id)),
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST: embed_link 속성 추가 + 누락 위젯 생성
  if (req.method === 'POST') {
    const result = { addedProperty: false, created: [], skipped: [], errors: [] };
    try {
      // 1. DB 스키마 조회
      const dbRes = await fetch(`https://api.notion.com/v1/databases/${dbId}`, { headers: H });
      const db = await dbRes.json();
      if (db.object === 'error') throw new Error(db.message);
      const titleKey = Object.keys(db.properties).find(k => db.properties[k].type === 'title');

      // 2. embed_link 속성 없으면 추가
      if (!db.properties.embed_link) {
        const pRes = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
          method: 'PATCH', headers: H,
          body: JSON.stringify({ properties: { embed_link: { url: {} } } }),
        });
        if (pRes.ok) result.addedProperty = true;
        else result.errors.push('embed_link 속성 추가 실패');
      }

      // 3. 기존 위젯 ID 목록
      const qRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST', headers: H, body: JSON.stringify({ page_size: 100 }),
      });
      const qData = await qRes.json();
      const existing = new Set(
        (qData.results || []).map(p => p.properties[titleKey]?.title?.[0]?.plain_text).filter(Boolean)
      );

      // 4. 누락 위젯 생성
      const rt = v => ({ rich_text: [{ text: { content: v || '' } }] });
      for (const w of WIDGETS) {
        if (existing.has(w.id)) { result.skipped.push(w.id); continue; }
        const embedLink = `${BASE_URL}/widgets/${w.id}/`;
        const cRes = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers: H,
          body: JSON.stringify({
            parent: { database_id: dbId },
            properties: {
              [titleKey]: { title: [{ text: { content: w.id } }] },
              title:          rt(w.title),
              display_title:  rt(w.title),
              color:          rt(w.color),
              accent:         rt(w.accent),
              font:           rt(w.font),
              type:           rt(w.type),
              embed_link:     { url: embedLink },
            },
          }),
        });
        const d = await cRes.json();
        if (cRes.ok) result.created.push(w.id);
        else result.errors.push(`${w.id}: ${d.message || 'error'}`);
      }

      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
}
