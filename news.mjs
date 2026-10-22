export function filterBriefings(briefings, {date = '', category = 'all', query = ''} = {}) {
  const term = query.trim().toLocaleLowerCase('ko');
  return briefings.filter(b => (!date || b.date === date) && (category === 'all' || b.category === category)
    && (!term || [b.category_label, b.raw_text, ...b.items.flatMap(item => [item.text, ...item.links.map(link => link.label)])].join(' ').toLocaleLowerCase('ko').includes(term)))
    .sort((a,b) => b.published_at.localeCompare(a.published_at));
}

export function categoryLabels(briefings, category) {
  return [...new Set(briefings.filter(b => b.category === category).map(b => b.category_label))].join(' · ')
    || (category === 'economy' ? '경제' : '제조 AI');
}

export function safeUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function validateFeed(feed) {
  const text = value => typeof value === 'string';
  const iso = value => text(value) && Number.isFinite(Date.parse(value));
  if (!feed || feed.schema_version !== 1 || !iso(feed.updated_at) || !Array.isArray(feed.briefings)
    || !feed.briefings.every(b => b && text(b.id) && ['manufacturing-ai','economy'].includes(b.category)
      && text(b.category_label) && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && /^\d{2}:\d{2}$/.test(b.time)
      && iso(b.published_at) && text(b.raw_text) && Array.isArray(b.items)
      && b.items.every(item => item && text(item.text) && Array.isArray(item.links)
        && item.links.every(link => link && text(link.label) && text(link.url))))) {
    throw new Error('지원하지 않거나 손상된 뉴스 데이터입니다.');
  }
  return feed;
}

export function availableDates(briefings) {
  return [...new Set(briefings.map(briefing => briefing.date))].sort().reverse();
}
