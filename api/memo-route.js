const HEADERS = {
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

const DIARY_DB_ID    = '37451f4140c5808e9141c8804e892661';
const TODO_DB_ID     = '37651f4140c5805e875cdc92a5715d21';
const CART_DB_ID     = '37751f4140c580598f09f7903db2248f';
const IDEA_DB_ID     = '37a51f4140c580e4bcf9f6279769ae26';
const BOOKMARK_DB_ID = 'ac98568f39fc489c89ca3844122b7266';

function getSeoulNow() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  if (now.getHours() < 5) now.setDate(now.getDate() - 1);
  return now;
}

function pad(n) { return String(n).padStart(2, '0'); }

function todayStr() {
  const now = getSeoulNow();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function calcQuadrant(dueDateStr, today) {
  if (!dueDateStr) return '4사분면';
  const d = dueDateStr.slice(0, 10);
  if (d <= today) return '1사분면';
  const sevenDays = new Date(getSeoulNow());
  sevenDays.setDate(sevenDays.getDate() + 6);
  if (d <= sevenDays.toLocaleDateString('sv-SE')) return '2사분면';
  const thirtyDays = new Date(getSeoulNow());
  thirtyDays.setDate(thirtyDays.getDate() + 29);
  if (d <= thirtyDays.toLocaleDateString('sv-SE')) return '3사분면';
  return '4사분면';
}

async function routeDiary(text) {
  const today = todayStr();
  const now = getSeoulNow();
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const qr = await fetch(`https://api.notion.com/v1/databases/${DIARY_DB_ID}/query`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ filter: { property: '날짜', date: { equals: today } } }),
  });
  const qd = await qr.json();
  if (qd.object === 'error') throw new Error(qd.message);

  let pageId = qd.results?.[0]?.id;

  if (!pageId) {
    const cr = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        parent: { database_id: DIARY_DB_ID },
        properties: { '날짜': { date: { start: today } } },
      }),
    });
    const cd = await cr.json();
    if (cd.object === 'error') throw new Error(cd.message);
    pageId = cd.id;
  }

  await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({
      children: [{
        type: 'quote',
        quote: {
          rich_text: [
            { type: 'text', text: { content: timeStr }, annotations: { color: 'gray' } },
            { type: 'text', text: { content: '\n' + text } },
          ],
        },
      }],
    }),
  });
}

async function routeTodo(text, dueDate) {
  const today = todayStr();
  const quadrant = calcQuadrant(dueDate, today);

  const properties = {
    '이름': { title: [{ text: { content: text } }] },
    '추가일': { date: { start: today } },
    '완료': { checkbox: false },
    '사분면': { select: { name: quadrant } },
  };
  if (dueDate) properties['마감일'] = { date: { start: dueDate } };

  const r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ parent: { database_id: TODO_DB_ID }, properties }),
  });
  const d = await r.json();
  if (d.object === 'error') throw new Error(d.message);
}

async function routeCart(text, cartType) {
  const properties = {
    '이름': { title: [{ text: { content: text } }] },
  };
  if (cartType) properties['종류'] = { select: { name: cartType } };

  const r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ parent: { database_id: CART_DB_ID }, properties }),
  });
  const d = await r.json();
  if (d.object === 'error') throw new Error(d.message);
}

async function routeIdea(text, area) {
  const properties = {
    '이름': { title: [{ text: { content: text } }] },
  };
  if (area) properties['영역'] = { select: { name: area } };

  const r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ parent: { database_id: IDEA_DB_ID }, properties }),
  });
  const d = await r.json();
  if (d.object === 'error') throw new Error(d.message);
}

async function routeBookmark(text, title, link) {
  const properties = {
    '제목': { title: [{ text: { content: title } }] },
    '내용': { rich_text: [{ text: { content: text } }] },
  };
  if (link) properties['링크'] = { url: link };

  const r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ parent: { database_id: BOOKMARK_DB_ID }, properties }),
  });
  const d = await r.json();
  if (d.object === 'error') throw new Error(d.message);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { memoId, text, target, dueDate, cartType, ideaArea, bookmarkTitle, bookmarkLink } = req.body;
  if (!text || !target) return res.status(400).json({ error: 'text, target required' });

  try {
    switch (target) {
      case 'DIARY':    await routeDiary(text); break;
      case 'TO-DO':    await routeTodo(text, dueDate); break;
      case 'CART':     await routeCart(text, cartType); break;
      case 'IDEA':     await routeIdea(text, ideaArea); break;
      case 'BOOKMARK': await routeBookmark(text, bookmarkTitle, bookmarkLink); break;
      case 'ETC': break;
      default:
        return res.status(400).json({ error: `unknown target: ${target}` });
    }

    if (memoId) {
      const markDone = ['DIARY', 'TO-DO', 'CART', 'IDEA', 'BOOKMARK'].includes(target);
      const properties = {
        '분류': { select: { name: target } },
      };
      if (markDone) properties['처리완료'] = { checkbox: true };

      await fetch(`https://api.notion.com/v1/pages/${memoId}`, {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({ properties }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
