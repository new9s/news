import { availableDates, filterBriefings, categoryLabels, safeUrl, validateFeed } from './news.mjs';

const $ = selector => document.querySelector(selector);
const list = $('#briefings');
const state = $('#state');
const dateInput = $('#date');
const search = $('#search');
const tabs = [...document.querySelectorAll('[data-category]')];
let feed = null;
let category = 'all';
let controller;

// Feed content is always plain text, never parsed as HTML.
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function showState(kicker, title, description, action) {
  state.hidden = false;
  state.replaceChildren(node('p', kicker, 'eyebrow'), node('h2', title), node('p', description));
  if (action) {
    const button = node('button', action.label);
    button.type = 'button';
    button.addEventListener('click', action.run);
    state.append(button);
  }
}

function renderBriefing(briefing, index) {
  const section = node('section', undefined, 'briefing');
  const heading = node('div', undefined, 'briefing-heading');
  const title = node('h2', briefing.category_label);
  title.id = `briefing-heading-${index}`;
  section.setAttribute('aria-labelledby', title.id);
  const timestamp = node('time', `${briefing.date.replaceAll('-', '.')} · ${briefing.time} KST`);
  timestamp.dateTime = briefing.published_at;
  heading.append(node('span', `BRIEFING ${String(index + 1).padStart(2, '0')}`, 'briefing-index'), title, timestamp);
  const items = node('ol', undefined, 'news-list');
  briefing.items.forEach((item, itemIndex) => {
    const card = node('li', undefined, 'news-card');
    const number = node('span', String(itemIndex + 1).padStart(2, '0'), 'news-number');
    number.setAttribute('aria-hidden', 'true');
    const body = node('div', undefined, 'news-body');
    body.append(node('p', item.text, 'news-text'));
    const sources = node('div', undefined, 'sources');
    item.links.forEach(link => {
      const url = safeUrl(link.url);
      if (!url) return;
      const anchor = node('a', `${link.label || new URL(url).hostname} ↗`);
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.setAttribute('aria-label', `${link.label || new URL(url).hostname} (새 탭에서 원문 열기)`);
      sources.append(anchor);
    });
    body.append(sources.childElementCount ? sources : node('p', '연결된 원문이 없습니다.', 'no-source'));
    card.append(number, body);
    items.append(card);
  });
  if (!briefing.items.length) items.append(node('li', '이 브리핑에는 등록된 기사가 없습니다.', 'no-source'));
  section.append(heading, items);
  return section;
}

function resetFilters() {
  category = 'all';
  search.value = '';
  render();
}

function render() {
  if (!feed) return;
  const dates = availableDates(feed.briefings);
  const selected = dateInput.value;
  const day = feed.briefings.filter(b => b.date === selected);
  const filtered = filterBriefings(feed.briefings, {date: selected, category, query: search.value});
  const totalItems = filtered.reduce((count, b) => count + b.items.length, 0);
  list.replaceChildren(...filtered.map(renderBriefing));
  list.setAttribute('aria-busy', 'false');
  $('#result-count').textContent = `${filtered.length}개 브리핑 · ${totalItems}개 기사${search.value.trim() ? ' · 검색 결과' : ''}`;
  $('#reset').hidden = category === 'all' && !search.value;
  tabs.forEach(button => {
    const key = button.dataset.category;
    const count = day.filter(b => key === 'all' || b.category === key).reduce((sum,b) => sum + b.items.length,0);
    button.replaceChildren(document.createTextNode(key === 'all' ? '전체 ' : `${categoryLabels(day, key)} `), node('span', String(count)));
    button.setAttribute('aria-pressed', String(category === key));
  });
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const latest = selected === dates[0];
  $('#latest').toggleAttribute('aria-current', latest);
  if (latest) $('#latest').setAttribute('aria-current','page');
  $('#edition-label').textContent = latest ? 'LATEST EDITION' : 'FROM THE ARCHIVE';
  $('#page-title').textContent = selected === today ? '오늘의 흐름' : latest ? '최신 브리핑' : '지난 흐름, 다시 읽기';
  $('#date-caption').textContent = selected ? `${selected.replaceAll('-', '.')} · ${latest ? '가장 최근에 도착한 뉴스입니다.' : '이날의 브리핑을 모았습니다.'}` : '아직 등록된 브리핑이 없습니다.';
  state.hidden = filtered.length > 0;
  if (!feed.briefings.length) {
    showState('NO BRIEFINGS YET', '아직 도착한 브리핑이 없습니다.', '새로운 뉴스가 등록되면 이곳에서 확인할 수 있습니다.');
  } else if (!filtered.length) {
    showState('NO RESULTS', '조건에 맞는 뉴스가 없습니다.', '다른 분야나 날짜를 선택하거나 검색어를 바꿔 보세요.', {label:'필터 초기화',run:resetFilters});
  }
}

async function load() {
  controller?.abort();
  controller = new AbortController();
  const request = controller;
  const timeout = setTimeout(() => request.abort(), 20000);
  feed = null;
  list.replaceChildren();
  list.setAttribute('aria-busy','true');
  $('#refresh').disabled = true;
  dateInput.disabled = true;
  $('#result-count').textContent = '브리핑을 불러오는 중입니다.';
  $('#updated-at').textContent = '확인 중';
  showState('LOADING','브리핑을 불러오고 있습니다.','잠시만 기다려 주세요.');
  try {
    const response = await fetch('./data/news.json', {cache:'no-store',signal:request.signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = validateFeed(await response.json());
    if (request !== controller) return;
    feed = data;
    const previousDate = dateInput.value;
    const dates = availableDates(feed.briefings);
    dateInput.replaceChildren(...dates.map(date => {
      const option = node('option',date.replaceAll('-', '.'));
      option.value = date;
      return option;
    }));
    if (dates.includes(previousDate)) dateInput.value = previousDate;
    dateInput.disabled = !dates.length;
    $('#updated-at').textContent = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(feed.updated_at));
    $('#updated-at').dateTime = feed.updated_at;
    render();
  } catch (error) {
    if (request !== controller) return;
    list.setAttribute('aria-busy','false');
    $('#result-count').textContent = '데이터를 불러오지 못했습니다.';
    $('#updated-at').textContent = '확인할 수 없음';
    showState('CONNECTION ERROR','뉴스를 불러오지 못했습니다.','연결 상태를 확인하고 다시 시도해 주세요. 문제가 계속되면 데이터가 아직 준비되지 않았을 수 있습니다.',{label:'다시 시도',run:load});
  } finally {
    clearTimeout(timeout);
    if (request === controller) $('#refresh').disabled = false;
  }
}

tabs.forEach(button => button.addEventListener('click', () => {category = button.dataset.category; render();}));
search.addEventListener('input', render);
dateInput.addEventListener('change', render);
$('#reset').addEventListener('click',resetFilters);
$('#refresh').addEventListener('click',load);
$('#latest').addEventListener('click', () => {
  if (!feed) return;
  dateInput.value = availableDates(feed.briefings)[0] || '';
  resetFilters();
});
load();
