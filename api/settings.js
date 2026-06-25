const PAGE_ID = '38551f4140c5801cac73fd07c2f25b4c';
const HEADERS = {
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

async function readSettings() {
  const r = await fetch(`https://api.notion.com/v1/blocks/${PAGE_ID}/children?page_size=10`, {
    headers: HEADERS,
  });
  const d = await r.json();
  if (d.object === 'error') throw new Error(d.message);

  const codeBlock = d.results?.find(b => b.type === 'code');
  if (!codeBlock) return {};

  const text = codeBlock.code.rich_text.map(t => t.plain_text).join('');
  return JSON.parse(text);
}

async function writeSettings(settings) {
  // 기존 블록 모두 삭제
  const listR = await fetch(`https://api.notion.com/v1/blocks/${PAGE_ID}/children?page_size=100`, {
    headers: HEADERS,
  });
  const listD = await listR.json();
  if (listD.results?.length) {
    await Promise.all(
      listD.results.map(b =>
        fetch(`https://api.notion.com/v1/blocks/${b.id}`, {
          method: 'DELETE',
          headers: HEADERS,
        })
      )
    );
  }

  // 새 코드 블록으로 JSON 저장
  const json = JSON.stringify(settings, null, 2);
  const r = await fetch(`https://api.notion.com/v1/blocks/${PAGE_ID}/children`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({
      children: [{
        type: 'code',
        code: {
          language: 'json',
          rich_text: [{ type: 'text', text: { content: json } }],
        },
      }],
    }),
  });
  const d = await r.json();
  if (d.object === 'error') throw new Error(d.message);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const settings = await readSettings();
      return res.status(200).json(settings);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      await writeSettings(req.body);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
