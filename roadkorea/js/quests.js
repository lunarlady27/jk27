// 일일 퀘스트
const POOL = [
  { id: 'km', t: '어디든 5km 달리기', goal: 5, unit: 'km', reward: 500000 },
  { id: 'pax', t: '버스 승객 15명 태우기', goal: 15, unit: '명', reward: 800000 },
  { id: 'stops', t: '버스 정류장 8곳 정차하기', goal: 8, unit: '곳', reward: 700000 },
  { id: 'park', t: '주차 3번 성공하기', goal: 3, unit: '번', reward: 600000 },
  { id: 'green', t: '초록불에 교차로 15번 지나가기', goal: 15, unit: '번', reward: 500000 },
  { id: 'hwy', t: '호남고속도로 3km 달리기', goal: 3, unit: 'km', reward: 600000 },
  { id: 'night', t: '밤에 2km 달리기', goal: 2, unit: 'km', reward: 500000 },
  { id: 'nav', t: '내비 안내로 목적지 2곳 도착하기', goal: 2, unit: '곳', reward: 600000 },
  { id: 'busride', t: '시내버스 타고 1번 이동하기', goal: 1, unit: '번', reward: 500000 },
  { id: 'metro', t: '지하철 1호선 타고 이동하기', goal: 1, unit: '번', reward: 500000 },
  { id: 'cross', t: '건널목에서 열차가 지나갈 때까지 기다리기', goal: 1, unit: '번', reward: 400000 },
];
function today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
export function ensureQuests(S) {
  const day = today();
  if (S.quest && S.quest.day === day && Array.isArray(S.quest.list)) return S.quest;
  let seed = [...day].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const pool = [...POOL];
  const list = [];
  for (let i = 0; i < 3; i++) { const q = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; list.push({ ...q, prog: 0, done: false, claimed: false }); }
  S.quest = { day, list };
  return S.quest;
}
export function questAdd(S, id, n, onDone) {
  const Q = ensureQuests(S);
  for (const q of Q.list) {
    if (q.id !== id || q.done) continue;
    q.prog = Math.min(q.goal, Math.round((q.prog + n) * 10) / 10);
    if (q.prog >= q.goal) { q.done = true; if (onDone) onDone(q); }
  }
}
export function timeLeft() {
  const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0);
  const s = Math.max(0, (m - n) / 1000);
  return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
}
