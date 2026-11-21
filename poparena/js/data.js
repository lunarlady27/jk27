// ===================== 팝 아레나 — 맵 · 캐릭터 (모두 오리지널) =====================
export const T = 2; // 칸 크기 (m)
const TOP = [
  '#####################',
  '#...bb.........bb...#',
  '#.R.bb...###...bb.R.#',
  '#.........R.........#',
  '#..###..b...b..###..#',
  '#..#....b...b....#..#',
  '#..#....bb.bb....#..#',
  '#.......~~~~~.......#',
  '#bb.....~~~~~.....bb#',
  '#bb..##.......##..bb#',
  '#.....#.......#.....#',
  '#.....#..b.b..#.....#',
  '#..#.....bbb.....#..#',
  '#..#..##.....##..#..#',
  '#bb...............bb#',
];
const MID = '#...b....#G#....b...#';
export const ROWS = [...TOP, MID, ...TOP.slice().reverse().map((r) => r.replace(/R/g, 'B'))];
export const MW = ROWS[0].length, MH = ROWS.length;
for (const r of ROWS) if (r.length !== MW) throw new Error('map row ' + r);
export const tile = (cx, cz) => (cx < 0 || cz < 0 || cx >= MW || cz >= MH ? '#' : ROWS[cz][cx]);
export const solid = (ch) => ch === '#';
export const blocksMove = (ch) => ch === '#' || ch === '~';
export const SPAWN = { red: [], blue: [] };
export let GEM_SPOT = { x: 0, z: 0 };
ROWS.forEach((r, z) => [...r].forEach((ch, x) => {
  const p = { x: (x + 0.5) * T, z: (z + 0.5) * T };
  if (ch === 'R') SPAWN.red.push(p); if (ch === 'B') SPAWN.blue.push(p); if (ch === 'G') GEM_SPOT = p;
}));
export const tileAt = (x, z) => tile(Math.floor(x / T), Math.floor(z / T));

// 공격 종류: shot(총알 n발, 퍼짐), lob(던짐, 범위 폭발), melee(부채꼴), heal(아군 치유 + 적 피해)
export const HEROES = {
  volt: { id: 'volt', name: '볼트', role: '균형형', color: '#3fa9ff', hp: 3600, speed: 5.2,
    atk: { kind: 'shot', n: 3, burst: 0.09, spread: 0.05, dmg: 400, range: 9.5, speed: 22, size: 0.18 },
    sup: { name: '번개 돌진', kind: 'dash', dmg: 1400, range: 7, charge: 4000 }, desc: '세 발 연사, 필살기로 적을 뚫고 돌진' },
  punk: { id: 'punk', name: '펑키', role: '근접 산탄', color: '#ff7a3d', hp: 5000, speed: 5.0,
    atk: { kind: 'shot', n: 5, burst: 0, spread: 0.42, dmg: 320, range: 6.2, speed: 20, size: 0.16 },
    sup: { name: '점프 강타', kind: 'leap', dmg: 1600, range: 8, radius: 2.4, charge: 4200 }, desc: '가까울수록 강한 산탄, 필살기로 뛰어올라 내려찍기' },
  momo: { id: 'momo', name: '모모', role: '저격', color: '#b36bff', hp: 2900, speed: 5.0,
    atk: { kind: 'shot', n: 1, burst: 0, spread: 0, dmg: 1250, range: 14, speed: 30, size: 0.22 },
    sup: { name: '관통 대포', kind: 'beam', dmg: 2200, range: 16, charge: 3800 }, desc: '멀리서 한 방, 필살기는 벽까지 뚫는 대포' },
  tank: { id: 'tank', name: '두두', role: '탱커', color: '#7fd05a', hp: 7400, speed: 5.6,
    atk: { kind: 'melee', dmg: 1150, range: 3.2, arc: 1.2 },
    sup: { name: '회오리', kind: 'spin', dmg: 900, radius: 3.2, time: 2.2, charge: 5200 }, desc: '튼튼한 주먹, 필살기는 빙글빙글 회오리' },
  lumi: { id: 'lumi', name: '루미', role: '투척', color: '#ffd23a', hp: 3100, speed: 5.0,
    atk: { kind: 'lob', dmg: 1050, range: 8.5, radius: 1.7, flight: 0.7 },
    sup: { name: '거대 폭탄', kind: 'bigbomb', dmg: 2000, range: 9, radius: 3.0, charge: 4400 }, desc: '벽 너머로 폭탄 던지기, 필살기는 거대 폭탄' },
  som: { id: 'som', name: '솜', role: '지원', color: '#ff7ab6', hp: 3400, speed: 5.1,
    atk: { kind: 'heal', dmg: 800, heal: 700, range: 9, speed: 15, size: 0.3 },
    sup: { name: '치유의 꽃밭', kind: 'healzone', heal: 650, radius: 3.4, time: 4, charge: 4000 }, desc: '적은 때리고 아군은 고치는 구슬, 필살기로 치유 꽃밭' },
};
export const MODES = {
  gem: { id: 'gem', name: '젬 러시', icon: '💎', time: 150, desc: '가운데에서 나오는 젬 10개를 모아 15초 버티면 승리' },
  ko: { id: 'ko', name: '녹아웃 난투', icon: '🥊', time: 150, desc: '먼저 10번 쓰러뜨리거나 시간 끝에 더 많이 쓰러뜨린 팀 승리' },
};
export const BOT_NAMES = ['콩콩', '뭉치', '보리', '두부', '호두', '쿠키', '모찌', '자두', '꿀벌', '단추', '코코', '감자'];
