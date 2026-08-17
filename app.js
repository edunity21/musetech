/* ============================================================================
 *  app.js — 학생 화면
 *  버전: student v1.0.0 (2026-08-17)
 * ==========================================================================*/

const APP_VERSION = 'student v1.1.0 (2026-08-17) 입장통제';
console.log('%c' + APP_VERSION, 'background:#1DB954;color:#000;padding:2px 8px;border-radius:4px');
console.log('서버 주소:', SERVER_URL);

/* ---------------------------------------------------------------------------
 *  0. 앨범 표지 색 (분야마다 다르게. 화면 포인트 색은 초록 하나 그대로입니다)
 * -------------------------------------------------------------------------*/
const ART = [
  ['#1DB954', '#0E6B32'], ['#E8734A', '#8A3418'], ['#5B7CFA', '#26307A'],
  ['#F2C14E', '#8A6416'], ['#48C9B0', '#166352'], ['#B96BD8', '#5B2478'],
  ['#4FA8E8', '#144E7A'], ['#D2795E', '#78331F'], ['#8BC34A', '#3F6318'],
  ['#F06292', '#8A2247'], ['#A0A8B4', '#4A5058'], ['#00C2C7', '#00595C']
];
const artStyle = i => `background:linear-gradient(150deg,${ART[i % 12][0]},${ART[i % 12][1]})`;

/* ---------------------------------------------------------------------------
 *  1. 활동지 문항 (부록 2 문구 그대로)
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

/* ---------------------------------------------------------------------------
 *  2. 지금 상태
 * -------------------------------------------------------------------------*/
const S = {
  sid: '', name: '', cls: '', email: '',
  data: {},               // 활동지 답
  peer: [],               // 동료 평가
  seen: {},               // 살펴본 분야
  filter: 'all',
  search: '',
  submitted: false,
  cfg: null,              // 서버가 알려 준 제출 상태
  clockOffset: 0,         // 서버 시각 − 내 기기 시각
  lastSentPrint: '',
  serverBusy: false
};

const keyMain = () => 'mj:' + S.sid;
const keyPeer = () => 'mj:peer:' + S.sid;
const keySeen = () => 'mj:seen:' + S.sid;

/* 서버 기준 지금 시각 */
const serverNow = () => Date.now() + S.clockOffset;

/* ===========================================================================
 *  3. 로그인
 * ========================================================================= */

$('#verLine').textContent = APP_VERSION;

Auth.render($('#gsiBtn'), (p) => {
  $('#whoLine').innerHTML = `<b>${esc(p.email)}</b> 로 로그인했습니다.`;
  $('#step2').classList.remove('off');
  $('#inSid').focus();
});

$('#btnEnter').addEventListener('click', doEnter);
['inSid', 'inName', 'inPw'].forEach(id => {
  $('#' + id).addEventListener('keydown', e => { if (e.key === 'Enter') doEnter(); });
});

/* 학번 네 자리를 다 치면, 그 학급이 지금 들어올 수 있는지 미리 알려 줍니다.
   비밀번호를 다 넣고 나서야 "안 열렸습니다"를 보는 일이 없도록 하기 위함입니다. */
let tGateCheck = null;
$('#inSid').addEventListener('input', () => {
  const sid = $('#inSid').value.trim();
  const el = $('#gateMsg');
  clearTimeout(tGateCheck);
  if (!/^\d{4}$/.test(sid)) { el.textContent = ''; return; }
  el.innerHTML = '<span class="dim">' + esc(classOf(sid)) + ' 반 상태를 확인하는 중…</span>';
  tGateCheck = setTimeout(async () => {
    try {
      const r = await apiGet({ action: 'config', cls: classOf(sid) });
      if (!r || !r.ok || !r.entry) { el.textContent = ''; return; }
      if (r.entry.open) {
        let s = `<span style="color:var(--accent);font-weight:700">${esc(classOf(sid))} · 지금 들어올 수 있습니다</span>`;
        if (r.entry.to) s += `<br><span class="dim">수업 종료 ${esc(fmtDT(r.entry.to).slice(11))}</span>`;
        el.innerHTML = s;
      } else {
        el.innerHTML = `<span class="err">${esc(ERR_TEXT[r.entry.reason] || '아직 들어올 수 없습니다.')}</span>` +
          (r.entry.from ? `<br><span class="dim">입장 시작 예정 ${esc(fmtDT(r.entry.from))}</span>` : '');
      }
    } catch (e) { el.textContent = ''; }
  }, 500);
});

async function doEnter() {
  const msg = $('#gateMsg');
  const sid = $('#inSid').value.trim();
  const name = $('#inName').value.trim();
  const pw = $('#inPw').value;

  if (!Auth.alive()) { msg.innerHTML = '<span class="err">먼저 구글 로그인을 해 주세요.</span>'; return; }
  if (!/^\d{4}$/.test(sid)) { msg.innerHTML = '<span class="err">학번은 숫자 네 자리입니다.</span>'; return; }
  if (!name) { msg.innerHTML = '<span class="err">이름을 적어 주세요.</span>'; return; }
  if (!pw) { msg.innerHTML = '<span class="err">비밀번호를 적어 주세요.</span>'; return; }

  const btn = $('#btnEnter');
  btn.disabled = true; btn.textContent = '확인하는 중…';
  msg.textContent = '';

  const res = await apiPost('gate', { idToken: Auth.idToken, sid, name, pw });

  btn.disabled = false; btn.textContent = '들어가기';

  if (!res || !res.ok) {
    msg.innerHTML = `<span class="err">${esc(errText(res))}</span>`;
    return;
  }

  S.sid = sid;
  S.name = res.name || name;
  S.cls = res.cls || classOf(sid);
  S.email = Auth.email;
  if (res.now) S.clockOffset = new Date(res.now).getTime() - Date.now();
  if (res.draft) mergeServerDraft(res.draft);
  S.submitted = !!res.submitted;

  startApp();
}

/** 서버에 남아 있던 임시저장본을 불러옵니다. (기기가 바뀌어도 이어서 쓸 수 있게) */
function mergeServerDraft(draft) {
  const local = LS.get(keyMain(), null);
  const localCount = local ? countFilled(local) : -1;
  const serverCount = countFilled(draft);
  if (serverCount > localCount) {
    LS.set(keyMain(), draft);
    if (draft._peer) LS.set(keyPeer(), draft._peer);
  }
}

/* ===========================================================================
 *  4. 화면 시작
 * ========================================================================= */

function startApp() {
  S.data = LS.get(keyMain(), {});
  S.peer = LS.get(keyPeer(), []);
  S.seen = LS.get(keySeen(), {});
  if (!S.peer.length) S.peer = [blankPeer()];

  $('#gate').classList.add('hidden');
  $('#app').classList.remove('hidden');

  $('#whoBox').innerHTML = `${esc(S.cls)} · ${esc(S.name)}<br><span class="dim">${esc(S.sid)}</span>`;
  $('#subTitle').textContent = `${S.cls} ${S.name} · 생활화 영역`;
  $('#printWho').textContent = `${S.cls}  학번 ${S.sid}  이름 ${S.name}`;

  buildChips();
  renderAlbums();
  renderJobs();
  buildSheet();
  buildPeer();
  restorePresent();
  updateProgress();
  updateNowBar();

  pollConfig();
  setInterval(pollConfig, POLL_SECONDS * 1000);
  setInterval(tickStatus, 1000);
}

/* 탭 이동 */
$$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
function showTab(name) {
  $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  ['browse', 'sheet', 'present', 'peer'].forEach(n => {
    $('#panel-' + n).hidden = (n !== name);
  });
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (name === 'present') renderScript();
}
$('#btnGoSheet').addEventListener('click', () => showTab('sheet'));

/* ===========================================================================
 *  5. 산업 둘러보기
 * ========================================================================= */

function buildChips() {
  const chips = [
    ['all', '전체 12분야'],
    ['unseen', '아직 안 본 곳'],
    ['seen', '살펴본 곳'],
    ['mine', '내가 고른 곳']
  ];
  $('#chipRow').innerHTML = chips.map(([k, label]) =>
    `<button class="chip" data-f="${k}" aria-pressed="${k === 'all'}">${label}</button>`).join('');
  $$('#chipRow .chip').forEach(c => c.addEventListener('click', () => {
    S.filter = c.dataset.f;
    $$('#chipRow .chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
    renderAlbums();
  }));
}

$('#searchBox').addEventListener('input', e => {
  S.search = e.target.value.trim().toLowerCase();
  renderAlbums(); renderJobs();
});

function matchIndustry(ind) {
  if (!S.search) return true;
  const hay = [ind.name, ind.en, ind.one,
    ind.jobs.map(j => j.join(' ')).join(' '),
    (ind.terms || []).map(t => t.join(' ')).join(' '),
    (ind.search || []).join(' ')].join(' ').toLowerCase();
  return hay.includes(S.search);
}

function renderAlbums() {
  const list = INDUSTRIES.filter((ind, i) => {
    if (!matchIndustry(ind)) return false;
    if (S.filter === 'unseen') return !S.seen[ind.n];
    if (S.filter === 'seen') return !!S.seen[ind.n];
    if (S.filter === 'mine') return S.data.q1 === ind.n;
    return true;
  });

  $('#browseCount').textContent =
    `${list.length}개 보임 · 살펴본 분야 ${Object.keys(S.seen).length}/12`;

  $('#albumGrid').innerHTML = list.map(ind => {
    const i = INDUSTRIES.indexOf(ind);
    return `
    <button class="album ${S.data.q1 === ind.n ? 'picked' : ''}" data-n="${ind.n}">
      <div class="art" style="${artStyle(i)}">
        <span class="num">${ind.n}</span>
        <span class="en">${esc(ind.en)}</span>
        <span class="play" aria-hidden="true">▶</span>
      </div>
      ${S.seen[ind.n] ? '<span class="seen">봄</span>' : ''}
      <div class="nm">${esc(ind.name)}</div>
      <div class="ln">${esc(ind.one)}</div>
    </button>`;
  }).join('') || '<p class="dim">찾는 낱말이 들어간 분야가 없습니다.</p>';

  $$('#albumGrid .album').forEach(a =>
    a.addEventListener('click', () => openDetail(a.dataset.n)));

  $('#dotBrowse').textContent = Object.keys(S.seen).length + '/12';
}

function renderJobs() {
  const rows = [];
  INDUSTRIES.forEach((ind, i) => {
    ind.jobs.forEach(j => {
      const hay = (j.join(' ') + ' ' + ind.name).toLowerCase();
      if (S.search && !hay.includes(S.search)) return;
      rows.push(`
        <div class="track" role="button" tabindex="0" data-n="${ind.n}">
          <div class="i">${ind.n}</div>
          <div>
            <div class="jn">${esc(j[0])}</div>
            <div class="jd">${esc(j[1])}</div>
            <div class="js">필요한 역량 · ${esc(j[2])}</div>
            <div class="dim" style="font-size:.8rem">${esc(ind.name)}</div>
          </div>
        </div>`);
    });
  });
  $('#jobList').innerHTML = rows.join('') || '<p class="dim">찾는 낱말이 들어간 직업이 없습니다.</p>';
  $$('#jobList .track').forEach(t => {
    const go = () => openDetail(t.dataset.n);
    t.addEventListener('click', go);
    t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

/* ---------- 분야 상세 ---------- */
function openDetail(n) {
  const i = INDUSTRIES.findIndex(x => x.n === n);
  if (i < 0) return;
  const d = INDUSTRIES[i];

  S.seen[n] = true; LS.set(keySeen(), S.seen);

  const majors = (typeof MAJORS !== 'undefined' && MAJORS[n]) ? MAJORS[n] : null;

  $('#detail').innerHTML = `
    <div class="banner" style="${artStyle(i)}">
      <button class="back" id="btnBack" aria-label="닫기">✕</button>
      <div class="kicker">분야 ${d.n} · ${esc(d.en)}</div>
      <h2>${esc(d.name)}</h2>
      <p class="one">${esc(d.one)}</p>
    </div>

    <div class="detail-body">
      <div class="detail-actions">
        <button class="btn primary" id="btnPick">
          ${S.data.q1 === n ? '✓ 내가 고른 분야' : '이 분야로 정하기'}
        </button>
        <button class="btn ghost" id="btnClose2">닫기</button>
      </div>

      <div class="sec"><h3>무슨 일을 하나요</h3>
        ${d.what.map(p => `<p>${esc(p)}</p>`).join('')}</div>

      <div class="sec"><h3>일이 흘러가는 순서</h3>
        <ol class="flow">${d.flow.map(f => `<li>${esc(f)}</li>`).join('')}</ol></div>

      <div class="sec"><h3>이 분야의 직업들 · 하는 일 · 필요한 역량</h3>
        <div class="tracks">${d.jobs.map((j, k) => `
          <div class="track">
            <div class="i">${pad2(k + 1)}</div>
            <div>
              <div class="jn">${esc(j[0])}</div>
              <div class="jd">${esc(j[1])}</div>
              <div class="js">필요한 역량 · ${esc(j[2])}</div>
            </div>
          </div>`).join('')}</div></div>

      ${majors ? `<div class="sec"><h3>관련 학과</h3>
        <div class="taglist">${majors.map(m => `<span class="tag">${esc(m)}</span>`).join('')}</div>
        <p class="dim" style="margin-top:8px">참고용입니다. 이 학과만 갈 수 있다는 뜻은 아닙니다.</p></div>` : ''}

      <div class="sec"><h3>음악이 만드는 값어치 · 활동지 7번 대비</h3>
        ${d.value.map(p => `<p>${esc(p)}</p>`).join('')}</div>

      <div class="sec"><h3>우리나라에서는</h3>
        <ul class="think">${d.korea.map(k => `<li>${esc(k)}</li>`).join('')}</ul></div>

      <div class="sec"><h3>이런 말을 알아두면</h3>
        <div class="terms">${d.terms.map(t =>
          `<div class="term"><b>${esc(t[0])}</b> — <span>${esc(t[1])}</span></div>`).join('')}</div></div>

      <div class="sec"><h3>찾아볼 검색어</h3>
        <div class="taglist">${d.search.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>
        <p class="dim" style="margin-top:8px">이 낱말로 직접 찾아본 내용을 활동지 5번에 적으세요.</p></div>

      <div class="sec"><h3>생각해 볼 질문</h3>
        <ul class="think">${d.think.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
    </div>`;

  $('#detail').hidden = false;
  $('#detail').scrollTop = 0;
  document.body.style.overflow = 'hidden';

  $('#btnBack').addEventListener('click', closeDetail);
  $('#btnClose2').addEventListener('click', closeDetail);
  $('#btnPick').addEventListener('click', () => {
    setField('q1', n);
    buildSheet();
    toast(`${INDUSTRIES[i].name} 분야로 정했습니다`, 'ok');
    closeDetail();
    showTab('sheet');
  });
}

function closeDetail() {
  $('#detail').hidden = true;
  document.body.style.overflow = '';
  renderAlbums();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#detail').hidden) closeDetail();
});

/* ===========================================================================
 *  6. 활동지
 * ========================================================================= */

function buildSheet() {
  $('#qList').innerHTML = QUESTIONS.map(q => {
    const badge = q.badge
      ? `<span class="q-badge ${q.key ? 'key' : ''}">${esc(q.badge)}${q.key ? ' · 상·중을 가름' : ''}</span>`
      : '';
    let body = '';

    if (q.type === 'pick') {
      body = `<div class="picker">${INDUSTRIES.map(ind => `
        <button class="pick" data-pick="${ind.n}" aria-pressed="${S.data.q1 === ind.n}">
          <span class="pn">${ind.n}</span>${esc(ind.name)}
        </button>`).join('')}</div>`;
    } else if (q.type === 'line') {
      body = `<input type="text" id="f_${q.id}" maxlength="200"
                value="${esc(S.data[q.id] || '')}" placeholder="한 문장으로 적어 보세요">`;
    } else if (q.type === 'three') {
      const v = (S.data.q9 || '').split('\n');
      body = Q9_LABEL.map((lb, k) => `
        <div style="margin-bottom:8px">
          <div class="dim" style="margin-bottom:4px">${lb}</div>
          <input type="text" id="f_q9_${k}" maxlength="120" value="${esc(v[k] || '')}"
                 placeholder="한 문장">
        </div>`).join('');
    } else {
      body = `<textarea id="f_${q.id}" rows="${q.rows || 4}"
                placeholder="여기에 적으세요">${esc(S.data[q.id] || '')}</textarea>`;
    }

    return `
      <div class="q ${isDone(q) ? 'done' : ''}" id="qbox_${q.id}">
        <div class="q-head">
          <div class="q-no">${q.no}</div>
          <div class="q-title">${esc(q.title)}</div>
          ${badge}
        </div>
        <p class="q-sub">${esc(q.sub)}</p>
        <p class="q-help">작성 도움말 — ${esc(q.help)}</p>
        ${body}
        <div class="q-foot">
          <span class="cnt" id="cnt_${q.id}"></span>
          <span class="dim" id="hint_${q.id}"></span>
        </div>
      </div>`;
  }).join('');

  /* 분야 고르기 단추 */
  $$('#qList .pick').forEach(b => b.addEventListener('click', () => {
    setField('q1', b.dataset.pick);
    $$('#qList .pick').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    refreshQ('q1'); updateNowBar(); renderAlbums();
  }));

  /* 글자 입력 */
  QUESTIONS.forEach(q => {
    if (q.type === 'pick') { refreshQ(q.id); return; }
    if (q.type === 'three') {
      Q9_LABEL.forEach((_, k) => {
        const el = $('#f_q9_' + k);
        el.addEventListener('input', () => {
          const vals = Q9_LABEL.map((__, j) => $('#f_q9_' + j).value.trim());
          setField('q9', vals.join('\n'));
          refreshQ('q9');
        });
      });
      refreshQ('q9');
      return;
    }
    const el = $('#f_' + q.id);
    el.addEventListener('input', () => { setField(q.id, el.value); refreshQ(q.id); });
    refreshQ(q.id);
  });

  applyLock();
}

function isDone(q) {
  const v = S.data[q.id];
  if (q.type === 'pick') return !!v;
  if (q.type === 'three') {
    const parts = String(v || '').split('\n');
    return parts.filter(x => x.trim().length >= 5).length >= 3;
  }
  return String(v || '').trim().length >= q.min;
}

function refreshQ(id) {
  const q = QUESTIONS.find(x => x.id === id);
  const box = $('#qbox_' + id);
  const cnt = $('#cnt_' + id);
  const hint = $('#hint_' + id);
  if (!q || !box) return;

  const done = isDone(q);
  box.classList.toggle('done', done);

  if (q.type === 'pick') {
    const ind = INDUSTRIES.find(x => x.n === S.data.q1);
    cnt.textContent = ind ? `고른 분야 · ${ind.name}` : '';
    cnt.className = 'cnt ' + (ind ? 'ok' : '');
    hint.textContent = ind ? '' : '먼저 분야를 고르세요';
  } else if (q.type === 'three') {
    const parts = String(S.data.q9 || '').split('\n').filter(x => x.trim());
    cnt.textContent = `${parts.length}문장`;
    cnt.className = 'cnt ' + (done ? 'ok' : 'low');
    hint.textContent = done ? '1분 발표에 알맞습니다' : '세 문장을 모두 채우세요';
  } else {
    const n = String(S.data[id] || '').trim().length;
    cnt.textContent = `${n}자`;
    cnt.className = 'cnt ' + (done ? 'ok' : (n > 0 ? 'low' : ''));
    hint.textContent = done ? '' : `${q.min}자 이상 권장`;
  }
  updateProgress();
}

function setField(id, val) {
  S.data[id] = val;
  S.data._sid = S.sid; S.data._name = S.name; S.data._cls = S.cls;
  S.data._at = new Date().toISOString();
  saveLocalSoon();
  saveServerSoon();
  if (id === 'q1') updateNowBar();
}

function countFilled(d) {
  if (!d) return 0;
  return QUESTIONS.filter(q => {
    const v = d[q.id];
    if (q.type === 'pick') return !!v;
    if (q.type === 'three') return String(v || '').split('\n').filter(x => x.trim().length >= 5).length >= 3;
    return String(v || '').trim().length >= q.min;
  }).length;
}

function updateProgress() {
  const n = countFilled(S.data);
  const pct = Math.round(n / QUESTIONS.length * 100);
  $('#pgFill').style.width = pct + '%';
  $('#pgTxt').textContent = `9개 중 ${n}개 작성`;
  $('#dotSheet').textContent = n + '/9';
}

function updateNowBar() {
  const ind = INDUSTRIES.find(x => x.n === S.data.q1);
  const i = ind ? INDUSTRIES.indexOf(ind) : -1;
  $('#nowName').textContent = ind ? ind.name : '아직 고르지 않았습니다';
  $('#nowThumb').textContent = ind ? ind.n : '–';
  $('#nowThumb').setAttribute('style', ind ? artStyle(i) : '');
}

/* ---------- 저장 ---------- */
let tLocal = null, tServer = null, lastServerAt = 0;

function saveLocalSoon() {
  clearTimeout(tLocal);
  tLocal = setTimeout(() => {
    LS.set(keyMain(), S.data);
    LS.set(keyPeer(), S.peer);
    markSave('기기에 저장됨', '');
  }, 600);
}

/** 서버 임시저장 — 2초 모았다가, 내용이 바뀌었을 때만, 15초에 한 번만 보냅니다. */
function saveServerSoon() {
  clearTimeout(tServer);
  tServer = setTimeout(() => {
    const gap = Date.now() - lastServerAt;
    if (gap < 15000) { tServer = setTimeout(() => saveServerSoon(), 15000 - gap); return; }
    saveServerNow(false);
  }, 2000);
}

async function saveServerNow(loud) {
  const payload = buildPayload();
  const print = fingerprint(JSON.stringify(payload));
  if (print === S.lastSentPrint) {           // 내용이 안 바뀌었으면 보내지 않습니다
    if (loud) markSave('바뀐 내용이 없습니다', 'ok');
    return { ok: true, skipped: true };
  }
  if (S.serverBusy) return { ok: false };
  S.serverBusy = true;
  markSave('서버에 저장 중…', '');

  const res = await apiPost('draft', { idToken: Auth.idToken, sid: S.sid, data: payload });

  S.serverBusy = false;
  lastServerAt = Date.now();

  if (res && res.ok) {
    S.lastSentPrint = print;
    markSave('서버에 저장됨 ' + fmtDT(new Date()).slice(11), 'ok');
    if (loud) toast('저장했습니다', 'ok');
  } else if (res && String(res.error || '').indexOf('ENTRY_') === 0) {
    /* 수업 시간이 아니어서 거절된 것입니다. 고장이 아닙니다. */
    markSave('수업 시간 밖 · 기기에만 저장됨', 'bad');
    if (loud) toast(errText(res), 'warn', 5000);
  } else {
    markSave('서버 저장 실패 (기기에는 남아 있음)', 'bad');
    if (loud) toast(errText(res), 'bad', 4000);
  }
  return res;
}

function markSave(text, kind) {
  const el = $('#saveState');
  el.textContent = text;
  el.className = 'save ' + (kind || '');
}

function buildPayload() {
  const ind = INDUSTRIES.find(x => x.n === S.data.q1);
  const o = {
    sid: S.sid, name: S.name, cls: S.cls,
    q1: S.data.q1 || '', q1name: ind ? ind.name : '',
    group: S.data.group || '', order: S.data.order || '',
    progress: countFilled(S.data)
  };
  ['q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'].forEach(k => o[k] = String(S.data[k] || '').trim());
  return o;
}

/* 탭을 닫을 때 한 번 더 */
function flushOnLeave() {
  LS.set(keyMain(), S.data);
  LS.set(keyPeer(), S.peer);
  const payload = buildPayload();
  if (fingerprint(JSON.stringify(payload)) === S.lastSentPrint) return;
  apiBeacon('draft', { idToken: Auth.idToken, sid: S.sid, data: payload });
}
window.addEventListener('pagehide', flushOnLeave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushOnLeave(); });
window.addEventListener('beforeunload', (e) => {
  flushOnLeave();
  if (!S.submitted && countFilled(S.data) > 0) { e.preventDefault(); e.returnValue = ''; }
});

$('#btnSave').addEventListener('click', () => saveServerNow(true));

/* ---------- 제출 ---------- */
$('#btnSubmit').addEventListener('click', async () => {
  const n = countFilled(S.data);
  if (!S.data.q1) { toast('먼저 분야를 고르세요', 'warn'); showTab('sheet'); return; }
  if (n < 9 && !confirm(`아직 ${9 - n}개 문항이 비어 있습니다. 그래도 낼까요?`)) return;

  const btn = $('#btnSubmit');
  btn.disabled = true; btn.textContent = '내는 중…';

  await saveServerNow(false);
  const res = await apiPost('submit', {
    idToken: Auth.idToken, sid: S.sid, data: buildPayload(),
    peer: S.peer.filter(p => p.sid)
  });

  btn.disabled = false; btn.textContent = '지금 제출하기';

  if (res && res.ok) {
    S.submitted = true;
    toast(`제출을 마쳤습니다 (${res.count}번째)`, 'ok', 4000);
    applyLock();
  } else {
    toast(errText(res), 'bad', 5000);
  }
});

/** 수업이 끝났거나, 제출이 닫혔거나, 이미 냈으면 입력을 잠급니다. */
function applyLock() {
  const entryShut = !!(S.cfg && S.cfg.entry && !S.cfg.entry.open);   // 수업 시간 밖
  const submitShut = !!(S.cfg && !S.cfg.open);                       // 제출 닫힘
  const submittedLock = S.submitted && !(S.cfg && S.cfg.resubmit);

  /* 수업 시간이 끝나면 글쓰기 자체를 막습니다. */
  const readOnly = entryShut || submittedLock;

  $$('#qList textarea, #qList input, #qList .pick').forEach(el => {
    if (el.tagName === 'BUTTON') el.disabled = readOnly;
    else el.readOnly = readOnly;
  });
  ['#inGroup', '#inOrder'].forEach(sel => { const el = $(sel); if (el) el.readOnly = readOnly; });
  $$('#peerList input, #peerList select, #peerList textarea, #peerList button')
    .forEach(el => { if (el.tagName === 'BUTTON' || el.tagName === 'SELECT') el.disabled = entryShut;
                     else el.readOnly = entryShut; });

  $('#btnSave').disabled = entryShut;
  $('#btnPeerAdd').disabled = entryShut;
  $('#btnPeerSave').disabled = entryShut;
  $('#btnSubmit').disabled = entryShut || submitShut || submittedLock;
  $('#btnSubmit').textContent = submittedLock ? '제출 완료' : '지금 제출하기';

  /* 내보내기와 인쇄는 언제나 됩니다. 학생이 자기 글을 못 가져가면 곤란하니까요. */
  $('#btnExport').disabled = false;
}

/* ===========================================================================
 *  7. 서버 상태 확인 (제출 열림/닫힘)
 * ========================================================================= */

async function pollConfig() {
  try {
    const r = await apiGet({ action: 'config', cls: S.cls });
    if (!r || !r.ok) return;

    const wasOpen = !!(S.cfg && S.cfg.entry && S.cfg.entry.open);
    const nowOpen = !!(r.entry && r.entry.open);

    S.cfg = r;
    if (r.now) S.clockOffset = new Date(r.now).getTime() - Date.now();
    applyLock();
    tickStatus();

    /* 수업이 방금 닫혔다면 한 번만 알리고, 마지막으로 저장을 시도합니다. */
    if (wasOpen && !nowOpen) {
      await saveServerNow(false);
      toast('수업 시간이 끝났습니다. 여기까지 저장되었습니다.', 'warn', 6000);
    }
    /* 수업이 방금 열렸다면 알려 줍니다. */
    if (!wasOpen && nowOpen && S.cfg) toast('수업이 열렸습니다', 'ok');
  } catch (e) { /* 잠깐 끊겨도 조용히 넘어갑니다 */ }
}

function tickStatus() {
  const el = $('#statusBar');
  if (!S.cfg) { el.className = 'statusbar wait'; el.textContent = '서버 상태를 확인하는 중…'; return; }

  const c = S.cfg;
  const now = serverNow();
  let cls = 'closed', txt = '';

  /* 수업 시간이 아니면 그것부터 알립니다. 제출 여부는 그다음 문제입니다. */
  if (c.entry && !c.entry.open) {
    const map = {
      ENTRY_BEFORE: c.entry.from
        ? `수업은 ${fmtDT(c.entry.from)} 부터 시작합니다`
        : '아직 수업이 열리지 않았습니다',
      ENTRY_AFTER: '수업 시간이 끝났습니다 · 쓰던 내용은 기기에 남아 있습니다',
      ENTRY_CLOSED: '선생님이 수업을 열어 주실 때까지 기다려 주세요'
    };
    $('#statusBar').className = 'statusbar closed';
    $('#statusBar').textContent = map[c.entry.reason] || '지금은 들어올 수 없는 시간입니다';
    return;
  }

  if (c.open) {
    cls = 'open';
    txt = '제출 열림';
    if (c.closeAt) {
      const left = new Date(c.closeAt).getTime() - now;
      txt += ` · 남은 시간 ${fmtLeft(left)}`;
      if (left < 5 * 60000) cls = 'wait';
    }
  } else if (c.reason === 'BEFORE_OPEN' && c.openAt) {
    cls = 'wait';
    txt = `제출은 ${fmtDT(c.openAt)} 부터 열립니다`;
  } else if (c.reason === 'AFTER_CLOSE') {
    txt = '제출이 마감되었습니다';
  } else {
    txt = '지금은 제출 시간이 아닙니다 · 쓰던 내용은 기기에 남습니다';
  }
  if (S.submitted) txt = '제출 완료 · ' + txt;

  /* 수업 종료가 10분 안으로 다가오면 함께 알려 줍니다. */
  if (c.entry && c.entry.to) {
    const leftClass = new Date(c.entry.to).getTime() - now;
    if (leftClass < 10 * 60000) {
      txt += ` · 수업 종료까지 ${fmtLeft(leftClass)}`;
      if (leftClass < 3 * 60000) cls = 'wait';
    }
  }
  if (c.notice) txt += ' · ' + c.notice;

  el.className = 'statusbar ' + cls;
  el.textContent = txt;
}

/* ===========================================================================
 *  8. 발표 준비
 * ========================================================================= */

function restorePresent() {
  $('#inGroup').value = S.data.group || '';
  $('#inOrder').value = S.data.order || '';
  $('#inGroup').addEventListener('input', e => setField('group', e.target.value.trim()));
  $('#inOrder').addEventListener('input', e => setField('order', e.target.value.trim()));
}

function renderScript() {
  const parts = String(S.data.q9 || '').split('\n');
  const ind = INDUSTRIES.find(x => x.n === S.data.q1);
  $('#scriptView').innerHTML = `
    <p class="dim">${ind ? esc(ind.name) + ' 분야' : '아직 분야를 고르지 않았습니다'}</p>
    <ul class="think">${Q9_LABEL.map((lb, k) => `
      <li><span class="dim">${lb}</span><br>
        ${parts[k] && parts[k].trim() ? esc(parts[k]) :
          '<span class="err">아직 비어 있습니다 — 활동지 9번에서 채우세요</span>'}</li>`).join('')}</ul>`;
}

let timerId = null, timerLeft = 60;
$('#btnTimer').addEventListener('click', () => {
  if (timerId) { clearInterval(timerId); timerId = null; $('#btnTimer').textContent = '이어서'; return; }
  $('#btnTimer').textContent = '멈춤';
  timerId = setInterval(() => {
    timerLeft--;
    $('#clock').textContent = fmtLeft(Math.max(0, timerLeft) * 1000);
    $('#clock').classList.toggle('over', timerLeft <= 0);
    if (timerLeft === 0) toast('1분입니다. 여기서 마무리하세요', 'warn');
    if (timerLeft <= -30) { clearInterval(timerId); timerId = null; $('#btnTimer').textContent = '시작'; }
  }, 1000);
});
$('#btnTimerReset').addEventListener('click', () => {
  clearInterval(timerId); timerId = null; timerLeft = 60;
  $('#clock').textContent = '01:00'; $('#clock').classList.remove('over');
  $('#btnTimer').textContent = '시작';
});

/* ===========================================================================
 *  9. 동료 평가
 * ========================================================================= */

const blankPeer = () => ({ sid: '', field: '', understand: '', best: '', curious: '' });

function buildPeer() {
  $('#peerList').innerHTML = S.peer.map((p, i) => `
    <div class="peer-item" data-i="${i}">
      <div class="row">
        <input type="text" data-k="sid" inputmode="numeric" maxlength="4"
               value="${esc(p.sid)}" placeholder="발표자 학번 네 자리">
        <select data-k="field">
          <option value="">무슨 분야였나요?</option>
          ${INDUSTRIES.map(ind => `<option value="${ind.n}"
            ${p.field === ind.n ? 'selected' : ''}>${esc(ind.n + ' ' + ind.name)}</option>`).join('')}
        </select>
      </div>
      <div class="seg" style="margin-bottom:8px">
        ${['잘 이해됨', '대체로 이해됨', '어려웠음'].map(u =>
          `<button data-u="${u}" aria-pressed="${p.understand === u}">${u}</button>`).join('')}
      </div>
      <div class="row">
        <textarea data-k="best" rows="2"
          placeholder="가장 인상 깊었던 한 가지">${esc(p.best)}</textarea>
        <textarea data-k="curious" rows="2"
          placeholder="더 궁금한 점 (질의응답에 씁니다)">${esc(p.curious)}</textarea>
      </div>
      <div class="btnrow"><button class="btn sm danger" data-del="${i}">이 칸 지우기</button></div>
    </div>`).join('');

  $$('#peerList .peer-item').forEach(box => {
    const i = +box.dataset.i;
    $$('[data-k]', box).forEach(el => el.addEventListener('input', () => {
      S.peer[i][el.dataset.k] = el.value;
      LS.set(keyPeer(), S.peer);
    }));
    $$('[data-u]', box).forEach(b => b.addEventListener('click', () => {
      S.peer[i].understand = b.dataset.u;
      $$('[data-u]', box).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      LS.set(keyPeer(), S.peer);
    }));
    $('[data-del]', box).addEventListener('click', () => {
      S.peer.splice(i, 1);
      if (!S.peer.length) S.peer = [blankPeer()];
      LS.set(keyPeer(), S.peer); buildPeer();
    });
  });
}

$('#btnPeerAdd').addEventListener('click', () => {
  if (S.peer.length >= 6) { toast('한 모둠은 보통 5명까지입니다', 'warn'); return; }
  S.peer.push(blankPeer()); LS.set(keyPeer(), S.peer); buildPeer();
});

$('#btnPeerSave').addEventListener('click', async () => {
  const items = S.peer.filter(p => /^\d{4}$/.test(p.sid));
  if (!items.length) { toast('발표자 학번을 네 자리로 적어 주세요', 'warn'); return; }
  const res = await apiPost('peer', { idToken: Auth.idToken, sid: S.sid, items });
  toast(res && res.ok ? `동료 평가 ${items.length}명분을 냈습니다` : errText(res),
        res && res.ok ? 'ok' : 'bad');
});

/* ===========================================================================
 *  10. 내보내기 — txt · 엑셀 · 인쇄 · 선생님께 낼 파일
 * ========================================================================= */

$('#btnExport').addEventListener('click', openExport);

function openExport() {
  let m = $('#exportModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'exportModal'; m.className = 'modal';
    m.innerHTML = `
      <div class="modal-box" style="max-width:460px">
        <div class="modal-head"><h2 style="margin:0">내보내기</h2>
          <button class="btn sm ghost" data-x>닫기</button></div>
        <div class="btnrow" style="flex-direction:column">
          <button class="btn block" data-a="txt">글 파일 (.txt)</button>
          <button class="btn block" data-a="csv">엑셀에서 열기 (.csv)</button>
          <button class="btn block" data-a="print">인쇄 · PDF로 저장</button>
          <button class="btn primary block" data-a="hand">선생님께 낼 파일 만들기</button>
        </div>
        <p class="dim" style="margin-top:12px">
          [선생님께 낼 파일]은 학번_이름.txt 로 저장됩니다.
          서버 제출이 안 될 때 이 파일을 내면 됩니다.</p>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      if (e.target === m || e.target.hasAttribute('data-x')) { m.hidden = true; return; }
      const a = e.target.getAttribute('data-a');
      if (!a) return;
      m.hidden = true;
      if (a === 'txt') download(fileName('txt'), asText(), 'text/plain');
      if (a === 'csv') download(fileName('csv'), '\uFEFF' + asCsv(), 'text/csv');
      if (a === 'print') { showTab('sheet'); setTimeout(() => window.print(), 120); }
      if (a === 'hand') download(fileName('txt'), asText(true), 'text/plain');
    });
  }
  m.hidden = false;
}

const fileName = ext => `${S.sid}_${S.name}_음악산업탐구.${ext}`;

function asText(forTeacher) {
  const ind = INDUSTRIES.find(x => x.n === S.data.q1);
  const L = [];
  L.push('음악 산업 탐구 활동지 — 생활화 영역 [9음03-02]');
  L.push('─'.repeat(46));
  L.push(`학급 ${S.cls}   학번 ${S.sid}   이름 ${S.name}`);
  L.push(`계정 ${S.email}`);
  L.push(`작성 시각 ${fmtDT(new Date())}`);
  L.push(`고른 분야 ${ind ? ind.n + ' ' + ind.name : '(고르지 않음)'}`);
  L.push(`모둠 ${S.data.group || '-'}   발표 순서 ${S.data.order || '-'}`);
  L.push('─'.repeat(46));
  QUESTIONS.forEach(q => {
    L.push('');
    L.push(`[${q.no}] ${q.title}${q.badge ? '  (' + q.badge + ')' : ''}`);
    if (q.type === 'pick') L.push(ind ? ind.n + ' ' + ind.name : '(비어 있음)');
    else if (q.type === 'three')
      String(S.data.q9 || '').split('\n').forEach((s, k) => L.push(`${Q9_LABEL[k]} ${s || '(비어 있음)'}`));
    else L.push(String(S.data[q.id] || '(비어 있음)'));
  });
  if (forTeacher) {
    L.push(''); L.push('─'.repeat(46));
    L.push(`작성 완료 ${countFilled(S.data)}/9`);
    L.push('※ 이 파일은 학생 기기에서 만든 것입니다. 서버 제출 기록과 함께 확인하세요.');
  }
  return L.join('\r\n');
}

function asCsv() {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const ind = INDUSTRIES.find(x => x.n === S.data.q1);
  const head = ['학급', '학번', '이름', '고른분야', ...QUESTIONS.map(x => x.no + '번')];
  const row = [S.cls, S.sid, S.name, ind ? ind.name : '',
    ind ? ind.n + ' ' + ind.name : '',
    ...['q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'].map(k => S.data[k] || ''),
    String(S.data.q9 || '').replace(/\n/g, ' / ')];
  return head.map(q).join(',') + '\r\n' + row.map(q).join(',');
}

function download(name, text, mime) {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  toast('파일을 내려받았습니다', 'ok');
}
