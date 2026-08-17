/* ============================================================================
 *  shared.js — 학생 화면과 교사 화면이 함께 쓰는 자료
 *  버전: shared v1.0.0 (2026-08-17)
 *
 *  여기 들어 있는 것
 *    1. 분야마다 다른 표지 색
 *    2. 분야마다 다른 그림 (SVG · 파일을 따로 받아오지 않습니다)
 *    3. 활동지 아홉 문항
 *
 *  ※ 그림을 왜 사진이 아니라 SVG 로 넣었는지
 *     · 인터넷에서 사진을 가져오면 저작권을 하나하나 확인해야 합니다.
 *     · 학교망에서 바깥 그림이 막히면 화면이 비어 버립니다.
 *     · SVG 는 글자와 같아서 아무리 키워도 깨지지 않고, 용량이 아주 작습니다.
 *     그림을 바꾸고 싶으면 아래 ART_SVG 의 해당 번호만 고치면 됩니다.
 * ==========================================================================*/

const SHARED_VERSION = 'shared v1.0.0 (2026-08-17)';

/* ---------------------------------------------------------------------------
 *  1. 표지 색 (진한 색 → 어두운 색으로 흐릅니다)
 * -------------------------------------------------------------------------*/
const ART = [
  ['#1DB954', '#0E6B32'], ['#E8734A', '#8A3418'], ['#5B7CFA', '#26307A'],
  ['#F2C14E', '#8A6416'], ['#48C9B0', '#166352'], ['#B96BD8', '#5B2478'],
  ['#4FA8E8', '#144E7A'], ['#D2795E', '#78331F'], ['#8BC34A', '#3F6318'],
  ['#F06292', '#8A2247'], ['#A0A8B4', '#4A5058'], ['#00C2C7', '#00595C']
];
const artStyle = i => `background:linear-gradient(150deg,${ART[i % 12][0]},${ART[i % 12][1]})`;

/* ---------------------------------------------------------------------------
 *  2. 분야 그림
 *     선으로 그린 그림입니다. 색은 CSS 가 정합니다(currentColor).
 * -------------------------------------------------------------------------*/
const _svg = inner =>
  `<svg class="art-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor"
        stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true">${inner}</svg>`;

const ART_SVG = {

  /* 01 음원 유통·스트리밍 — 재생 단추에서 신호가 퍼져 나갑니다 */
  '01': _svg(`
    <circle cx="24" cy="32" r="13"/>
    <path d="M20.5 26.5 L31 32 L20.5 37.5 Z" fill="currentColor" stroke="none"/>
    <path d="M42 24a12 12 0 0 1 0 16"/>
    <path d="M48.5 18a20 20 0 0 1 0 28"/>`),

  /* 02 공연 기획·제작 — 무대 위로 조명이 쏟아집니다 */
  '02': _svg(`
    <path d="M14 12h10l10 20H24z" fill="currentColor" opacity=".22" stroke="none"/>
    <path d="M50 12H40L30 32h10z" fill="currentColor" opacity=".22" stroke="none"/>
    <path d="M14 12h10l10 20H24z"/>
    <path d="M50 12H40L30 32h10z"/>
    <path d="M10 46h44"/>
    <path d="M32 46v-8"/>
    <circle cx="32" cy="35" r="3.4" fill="currentColor" stroke="none"/>
    <path d="M16 52h32"/>`),

  /* 03 음악 저작권 관리 — 방패가 음표를 지킵니다 */
  '03': _svg(`
    <path d="M32 10 52 17v14c0 11-8 19-20 23-12-4-20-12-20-23V17z"/>
    <path d="M28 42V27l10-2.5V38"/>
    <circle cx="25" cy="42" r="3.6" fill="currentColor" stroke="none"/>
    <circle cx="35" cy="38.5" r="3.6" fill="currentColor" stroke="none"/>`),

  /* 04 음악 교육 — 칠판에 오선을 그립니다 */
  '04': _svg(`
    <rect x="9" y="12" width="46" height="32" rx="3"/>
    <path d="M16 21h32M16 27h32M16 33h32"/>
    <circle cx="26" cy="33" r="3.4" fill="currentColor" stroke="none"/>
    <path d="M29.4 33V20l8 2"/>
    <path d="M22 50h20M32 44v6"/>`),

  /* 05 음악 치료 — 마음의 소리를 듣습니다 */
  '05': _svg(`
    <path d="M32 51S13 40 13 27a10 10 0 0 1 19-4 10 10 0 0 1 19 4c0 13-19 24-19 24z"/>
    <path d="M18 31h6l3-7 5 14 4-9 3 2h7"/>`),

  /* 06 영상음악 — 필름 위에 소리를 얹습니다 */
  '06': _svg(`
    <rect x="8" y="15" width="48" height="26" rx="3"/>
    <path d="M8 22h48M8 34h48"/>
    <path d="M18 15v7M28 15v7M38 15v7M48 15v7"/>
    <path d="M18 34v7M28 34v7M38 34v7M48 34v7"/>
    <circle cx="25" cy="49" r="4" fill="currentColor" stroke="none"/>
    <path d="M29 49V33l10 3v13"/>
    <circle cx="39" cy="49" r="4" fill="currentColor" stroke="none"/>`),

  /* 07 게임 음악 — 조작기에서 소리가 납니다 */
  '07': _svg(`
    <path d="M20 22h24a12 12 0 0 1 11 16l-2 5a6 6 0 0 1-10 2l-4-5H25l-4 5a6 6 0 0 1-10-2l-2-5a12 12 0 0 1 11-16z"/>
    <path d="M20 31v7M16.5 34.5h7"/>
    <circle cx="43" cy="32" r="2.4" fill="currentColor" stroke="none"/>
    <circle cx="48" cy="37" r="2.4" fill="currentColor" stroke="none"/>
    <path d="M28 15c0 4 8 3 8 7"/>`),

  /* 08 악기 제조·유통 — 손으로 깎아 만듭니다 */
  '08': _svg(`
    <path d="M30 24c-7 2-12 8-12 15a12 12 0 0 0 24 0c0-4-2-7-2-10s2-4 4-6"/>
    <circle cx="30" cy="39" r="5"/>
    <path d="M44 23l8-8"/>
    <path d="M40 19l5 5"/>
    <path d="M48 11l6 6-3 3-6-6z" fill="currentColor" opacity=".22"/>
    <path d="M48 11l6 6-3 3-6-6z"/>`),

  /* 09 음향 엔지니어링 — 조절기를 밀어 소리를 다듭니다 */
  '09': _svg(`
    <rect x="9" y="12" width="46" height="40" rx="3"/>
    <path d="M20 19v26M32 19v26M44 19v26"/>
    <rect x="15" y="26" width="10" height="6" rx="2" fill="currentColor" stroke="none"/>
    <rect x="27" y="36" width="10" height="6" rx="2" fill="currentColor" stroke="none"/>
    <rect x="39" y="22" width="10" height="6" rx="2" fill="currentColor" stroke="none"/>`),

  /* 10 아티스트 매니지먼트 — 무대에 세우고 뒤를 받칩니다 */
  '10': _svg(`
    <rect x="26" y="9" width="12" height="21" rx="6"/>
    <path d="M20 27a12 12 0 0 0 24 0"/>
    <path d="M32 39v8M24 47h16"/>
    <path d="M50 12l1.8 4.2L56 18l-4.2 1.8L50 24l-1.8-4.2L44 18l4.2-1.8z"
          fill="currentColor" stroke="none"/>
    <path d="M13 34l1.4 3.2L17.6 39l-3.2 1.4L13 43.6l-1.4-3.2L8.4 39l3.2-1.4z"
          fill="currentColor" stroke="none"/>`),

  /* 11 음악 저널리즘·평론 — 듣고 나서 글로 남깁니다 */
  '11': _svg(`
    <path d="M11 15h30v34H15a4 4 0 0 1-4-4z"/>
    <path d="M41 24h8a4 4 0 0 1 4 4v17a4 4 0 0 1-4 4h-8"/>
    <path d="M17 23h12M17 30h18M17 37h18M17 44h12"/>
    <circle cx="45" cy="37" r="3" fill="currentColor" stroke="none"/>
    <path d="M48 37V28"/>`),

  /* 12 인공지능 음악 기술 — 기계가 소리를 배웁니다 */
  '12': _svg(`
    <circle cx="14" cy="20" r="4"/>
    <circle cx="14" cy="44" r="4"/>
    <circle cx="30" cy="32" r="4"/>
    <path d="M17.5 22.5 26.5 29.5M17.5 41.5 26.5 34.5"/>
    <path d="M34 32h6"/>
    <circle cx="44" cy="47" r="5" fill="currentColor" stroke="none"/>
    <path d="M49 47V17l8 2.4"/>
    <path d="M49 26l8 2.4"/>`)
};

/** 분야 번호로 그림을 꺼냅니다. 없으면 빈 글자를 돌려줍니다. */
function artSvg(n) { return ART_SVG[String(n)] || ''; }

/* ---------------------------------------------------------------------------
 *  3. 활동지 아홉 문항 (운영안 부록 2 문구 그대로)
 * -------------------------------------------------------------------------*/
const QUESTIONS = [
  { id: 'q1', no: 1, type: 'pick', badge: '',
    title: '어떤 분야를 골랐나요?',
    sub: '열두 개 분야 가운데 하나를 고르세요.',
    help: '고르기 어려우면 [산업 둘러보기] 탭을 다시 보고 오세요.', min: 1 },

  { id: 'q2', no: 2, type: 'line', badge: '',
    title: '그 분야를 고른 이유는 무엇인가요?',
    sub: '한 문장이면 충분합니다.',
    help: '"평소에 게임을 많이 해서" 처럼 솔직하게 적으면 됩니다.', min: 5 },

  { id: 'q3', no: 3, type: 'area', badge: '산업 조사', rows: 4,
    title: '이 산업은 무엇을 하는 곳인가요?',
    sub: '무엇을 만들고, 누구에게 전하는지 적어 보세요.',
    help: '두세 문장. 조사한 내용을 자기 말로 바꾸어 적으세요.', min: 40 },

  { id: 'q4', no: 4, type: 'area', badge: '산업 조사', rows: 4,
    title: '이 산업에는 어떤 직업이 있나요?',
    sub: '두 가지 이상 적고, 각각 무슨 일을 하는지 함께 적으세요.',
    help: '"직업 이름 — 하는 일" 형태로 적으면 정리하기 쉽습니다.', min: 30 },

  { id: 'q5', no: 5, type: 'area', badge: '산업 조사', rows: 3,
    title: '조사한 곳을 적어 주세요.',
    sub: '서로 다른 곳 두 군데 이상을 적으세요.',
    help: '누리집 이름, 기사 제목, 영상 제목 등. 주소 전체가 아니어도 됩니다.', min: 15 },

  { id: 'q6', no: 6, type: 'area', badge: '활용 가치', rows: 4,
    title: '이 산업에서 음악은 어떤 장면에 쓰이나요?',
    sub: '구체적인 장면을 떠올려 적어 보세요.',
    help: '"게임에서 보스가 나타날 때 음악이 빨라진다" 처럼요.', min: 30 },

  { id: 'q7', no: 7, type: 'area', badge: '활용 가치', key: true, rows: 5,
    title: '이 산업에 음악이 없다면 무엇이 사라질까요?',
    sub: '음악이 그 산업에서 어떤 값어치를 하고 있는지 생각해 보는 문항입니다.',
    help: '음악을 모두 지웠다고 상상해 보세요. 무엇이 밋밋해지고, 누가 곤란해질까요?', min: 40 },

  { id: 'q8', no: 8, type: 'area', badge: '활용 가치', rows: 3,
    title: '이 분야와 나를 이어 주는 점이 있다면?',
    sub: '내 관심사나 앞으로의 진로와 닿는 부분을 적어 보세요.',
    help: '억지로 연결하지 않아도 됩니다. 없으면 "아직 잘 모르겠다"도 답이 됩니다.', min: 15 },

  { id: 'q9', no: 9, type: 'three', badge: '발표 수행',
    title: '발표용 핵심 세 문장',
    sub: '1분 동안 말할 내용을 세 문장으로 간추리세요.',
    help: '① 무슨 분야인가 ② 음악이 어떻게 쓰이는가 ③ 왜 중요한가', min: 3 }
];

const Q9_LABEL = ['① 무슨 분야인가', '② 음악이 어떻게 쓰이는가', '③ 왜 중요한가'];
