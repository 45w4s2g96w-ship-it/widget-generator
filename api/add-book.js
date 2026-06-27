const NOTION_HEADERS = {
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

// 각 데이터 키에 대한 한/영 프로퍼티명 후보
const PROP_ALIASES = {
  authors:       ['저자', '작가', '지은이', '글쓴이', 'author', 'authors'],
  publisher:     ['출판사', '출판', '발행처', 'publisher'],
  isbn:          ['isbn', 'ISBN', 'isbn13', 'ISBN13', 'ISBN-13'],
  description:   ['설명', '내용', '줄거리', '소개', 'description', '메모'],
  publishedDate: ['출판연도', '출판일', '발행일', '연도', 'published', 'publishedDate'],
  coverUrl:      ['표지', '표지이미지', '커버', 'cover', 'thumbnail', 'image'],
};

function findProp(schema, key) {
  const aliases = PROP_ALIASES[key] || [];
  return Object.entries(schema).find(([name]) =>
    aliases.some(a => a.toLowerCase() === name.toLowerCase())
  ) || null;
}

function normalizeDate(str) {
  if (!str) return null;
  if (/^\d{4}$/.test(str)) return str + '-01-01';
  if (/^\d{4}-\d{2}$/.test(str)) return str + '-01';
  return str.slice(0, 10);
}

function httpsUrl(url) {
  return url ? url.replace(/^http:\/\//, 'https://') : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // GET: Google Books 검색
  if (req.method === 'GET') {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'q required' });

    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    const params = new URLSearchParams({
      q,
      maxResults: '12',
      printType: 'books',
      ...(apiKey && { key: apiKey }),
    });

    try {
      const r = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
      const data = await r.json();

      const books = (data.items || []).map(item => {
        const info = item.volumeInfo || {};
        const thumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
        return {
          id: item.id,
          title: info.title || '',
          subtitle: info.subtitle || '',
          authors: info.authors || [],
          publisher: info.publisher || '',
          publishedDate: info.publishedDate || '',
          description: (info.description || '').slice(0, 2000),
          isbn: (info.industryIdentifiers || []).find(x => x.type === 'ISBN_13')?.identifier || '',
          thumbnail: httpsUrl(thumb),
          previewLink: info.previewLink || '',
        };
      });

      return res.status(200).json({ books });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST: Notion DB에 책 페이지 추가
  if (req.method === 'POST') {
    const { source_db_id, book } = req.body;
    if (!source_db_id || !book) return res.status(400).json({ error: 'source_db_id, book required' });

    try {
      // DB 스키마 조회
      const schemaRes = await fetch(`https://api.notion.com/v1/databases/${source_db_id}`, {
        headers: NOTION_HEADERS,
      });
      const schema = await schemaRes.json();
      if (schema.object === 'error') throw new Error(schema.message);
      const props = schema.properties || {};

      // title 프로퍼티 탐지 (모든 DB에 반드시 하나 존재)
      const titleEntry = Object.entries(props).find(([, v]) => v.type === 'title');
      if (!titleEntry) throw new Error('title 프로퍼티를 찾을 수 없습니다');
      const [titlePropName] = titleEntry;

      const properties = {
        [titlePropName]: { title: [{ text: { content: book.title } }] },
      };

      // 나머지 프로퍼티를 이름 매핑으로 설정
      for (const key of Object.keys(PROP_ALIASES)) {
        if (key === 'coverUrl') continue;
        const match = findProp(props, key);
        if (!match) continue;
        const [propName, propDef] = match;
        const raw = book[key];
        if (!raw || (Array.isArray(raw) && !raw.length)) continue;

        const strVal = Array.isArray(raw) ? raw.join(', ') : String(raw);

        switch (propDef.type) {
          case 'rich_text':
            properties[propName] = { rich_text: [{ text: { content: strVal } }] };
            break;
          case 'url':
            properties[propName] = { url: strVal };
            break;
          case 'date': {
            const d = key === 'publishedDate' ? normalizeDate(strVal) : strVal;
            if (d) properties[propName] = { date: { start: d } };
            break;
          }
          case 'select':
            properties[propName] = { select: { name: strVal.slice(0, 100) } };
            break;
          case 'multi_select': {
            const vals = Array.isArray(raw) ? raw : [strVal];
            properties[propName] = { multi_select: vals.slice(0, 10).map(n => ({ name: n.slice(0, 100) })) };
            break;
          }
        }
      }

      // 표지 프로퍼티 (url / files 타입)
      const coverMatch = findProp(props, 'coverUrl');
      if (coverMatch && book.thumbnail) {
        const [propName, propDef] = coverMatch;
        if (propDef.type === 'url') {
          properties[propName] = { url: book.thumbnail };
        } else if (propDef.type === 'files') {
          properties[propName] = {
            files: [{ type: 'external', name: book.title.slice(0, 100), external: { url: book.thumbnail } }],
          };
        }
      }

      const pageBody = {
        parent: { database_id: source_db_id },
        icon: { type: 'emoji', emoji: '📚' },
        properties,
      };

      // 페이지 커버 이미지 설정
      if (book.thumbnail) {
        pageBody.cover = { type: 'external', external: { url: book.thumbnail } };
      }

      const r = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: NOTION_HEADERS,
        body: JSON.stringify(pageBody),
      });
      const page = await r.json();
      if (page.object === 'error') throw new Error(page.message);

      return res.status(200).json({ ok: true, pageId: page.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
