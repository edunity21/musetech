/* ============================================================================
 *  app.js — 학생 화면
 *  버전: student v1.0.0 (2026-08-17)
 * ==========================================================================*/

const APP_VERSION = 'student v1.7.0 (2026-09-10) 거울저장';
console.log('%c' + APP_VERSION, 'background:#1DB954;color:#000;padding:2px 8px;border-radius:4px');
console.log('서버 주소:', SERVER_URL);

/* 표지 색 · 분야 그림 · 활동지 문항은 shared.js 에 있습니다.
   (교사 화면도 같은 내용을 쓰기 때문에 한 곳에 모아 두었습니다) */

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
  serverBusy: false,
  leaving: false,         // [나가기] 를 누른 뒤인지
  exam: false,            // 평가 모드인지 (수행평가 30분)
  autoSubmitted: false,   // 시간이 끝나 자동으로 낸 적이 있는지
  warned5: false, warned1: false
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

/* 구글 로그인이 끝나면, 그 계정이 명렬표에 있는지 서버에 물어봅니다.
   있으면 학번·이름을 대신 채워 주므로 학생은 비밀번호만 넣으면 됩니다.
   태블릿에서 네 자리 숫자를 잘못 눌러 남의 학번으로 들어가는 사고를 막습니다. */
let ME = null;

Auth.render($('#gsiBtn'), async (p) => {
  $('#whoLine').innerHTML = `<b>${esc(p.email)}</b> 로 로그인했습니다.`;
  $('#gateMsg').innerHTML = '<span class="dim">명렬표에서 찾는 중…</span>';

  const res = await apiPost('whoAmI', { idToken: Auth.idToken }, 12000);
  $('#gateMsg').textContent = '';

  if (res && res.ok && res.sid) {
    ME = res;
    showMeCard(res);
    $('#stepMe').classList.remove('off');
    $('#inPwMe').focus();
  } else {
    /* 명렬표에 없는 계정이면 예전처럼 손으로 넣습니다. (전학생 등) */
    if (res && res.error && res.error !== 'NOT_LINKED') {
      $('#gateMsg').innerHTML = `<span class="err">${esc(errText(res))}</span>`;
    }
    $('#step2').classList.remove('off');
    $('#inSid').focus();
  }
});

/** 「3학년 9반 1번 권선우」 카드를 그립니다. 그 반이 지금 열려 있는지도 함께. */
function showMeCard(me) {
  const c = me.config || {};
  let line = '';
  if (c.entry && c.entry.open) {
    line = `<div class="me-ok">지금 들어올 수 있습니다` +
           (c.entry.to ? ` · 수업 종료 ${esc(fmtDT(c.entry.to).slice(11))}` : '') + `</div>`;
  } else if (c.entry) {
    line = `<div class="me-no">${esc(ERR_TEXT[c.entry.reason] || '아직 들어올 수 없습니다.')}</div>`;
  }
  const no = String(me.sid).slice(2).replace(/^0/, '');
  $('#meCard').innerHTML = `
    <div class="me-name">${esc(me.name || '(이름 없음)')}</div>
    <div class="me-sub">${esc(me.cls)} · ${esc(no)}번 · 학번 ${esc(me.sid)}</div>
    ${line}`;
}

/* 「내가 아니라면」 — 손으로 넣는 칸으로 바꿉니다. */
$('#lnkManual').addEventListener('click', (e) => {
  e.preventDefault();
  ME = null;
  $('#stepMe').classList.add('off');
  $('#step2').classList.remove('off');
  $('#inSid').focus();
});

$('#btnEnterMe').addEventListener('click', doEnterMe);
$('#inPwMe').addEventListener('keydown', e => { if (e.key === 'Enter') doEnterMe(); });

async function doEnterMe() {
  if (!ME) return;
  const pw = $('#inPwMe').value;
  const msg = $('#gateMsg');
  if (!Auth.alive()) { msg.innerHTML = '<span class="err">먼저 구글 로그인을 해 주세요.</span>'; return; }
  if (!pw) { msg.innerHTML = '<span class="err">비밀번호를 적어 주세요.</span>'; return; }

  const btn = $('#btnEnterMe');
  btn.disabled = true; btn.textContent = '확인하는 중…';
  msg.textContent = '';

  const res = await apiPost('gate', { idToken: Auth.idToken, sid: ME.sid, name: ME.name, pw });

  btn.disabled = false; btn.textContent = '들어가기';
  if (!res || !res.ok) {
    msg.innerHTML = `<span class="err">${esc(errText(res))}</span>`;
    return;
  }
  enterWith(ME.sid, ME.name, res);
}

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

  enterWith(sid, name, res);
}

/** 입장이 허락된 뒤의 공통 처리. (자동 인식·손입력 두 경로가 함께 씁니다) */
function enterWith(sid, name, res) {
  S.sid = sid;
  S.name = res.name || name;
  S.cls = res.cls || classOf(sid);
  S.email = Auth.email;
  if (res.now) S.clockOffset = new Date(res.now).getTime() - Date.now();
  S.exam = !!res.exam;
  /* 평가 모드에서는 서버가 이전 내용을 보내지 않습니다. 혹시 와도 쓰지 않습니다. */
  if (!S.exam && res.draft) mergeServerDraft(res.draft);
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
  if (S.exam) {
    /* ── 평가 모드 ────────────────────────────────────────────────
       수행평가는 모두 같은 백지에서 출발해야 합니다.
       이 기기에 남아 있던 내용을 지우고, 앞으로도 기기에 남기지 않습니다.
       ('살펴본 분야' 표시는 답안이 아니므로 그대로 둡니다) */
    LS.del(keyMain());
    LS.del(keyPeer());
    S.data = {};
    S.peer = [blankPeer()];
    S.seen = LS.get(keySeen(), {});
    document.body.classList.add('exam');
  } else {
    S.data = LS.get(keyMain(), {});
    S.peer = LS.get(keyPeer(), []);
    S.seen = LS.get(keySeen(), {});
  }
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
  initVideo();
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
  if (name === 'present') {
    renderScript();
    if (typeof vRenderPrompt === 'function') vRenderPrompt();
  }
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
        ${artSvg(ind.n)}
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
      <div class="banner-art">${artSvg(d.n)}</div>
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
  $('#nowThumb').innerHTML = ind ? artSvg(ind.n) : '–';
  $('#nowThumb').setAttribute('style', ind ? artStyle(i) : '');
}

/* ---------- 저장 ---------- */
let tLocal = null, tServer = null, lastServerAt = 0;

function saveLocalSoon() {
  /* 평가 모드에서는 태블릿에 아무것도 남기지 않습니다. */
  if (S.exam) { markSave('평가 중 · 제출해야 남습니다', 'warn'); return; }
  clearTimeout(tLocal);
  tLocal = setTimeout(() => {
    LS.set(keyMain(), S.data);
    LS.set(keyPeer(), S.peer);
    markSave('기기에 저장됨', '');
  }, 600);
}

/** 서버 임시저장 — 2초 모았다가, 내용이 바뀌었을 때만, 15초에 한 번만 보냅니다. */
function saveServerSoon() {
  if (S.exam) return;                 // 평가 모드에서는 서버에도 남기지 않습니다
  clearTimeout(tServer);
  tServer = setTimeout(() => {
    const gap = Date.now() - lastServerAt;
    if (gap < 15000) { tServer = setTimeout(() => saveServerSoon(), 15000 - gap); return; }
    saveServerNow(false);
  }, 2000);
}

async function saveServerNow(loud) {
  if (S.exam) {
    if (loud) toast('평가 중에는 따로 저장하지 않습니다. [지금 제출하기] 를 누르세요.', 'warn', 5000);
    return { ok: true, skipped: true };
  }
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
  if (S.leaving) return;              // [나가기] 로 지운 뒤 다시 쓰지 않도록
  if (S.exam) return;                 // 평가 모드에서는 남기지 않습니다
  LS.set(keyMain(), S.data);
  LS.set(keyPeer(), S.peer);
  const payload = buildPayload();
  if (fingerprint(JSON.stringify(payload)) === S.lastSentPrint) return;
  apiBeacon('draft', { idToken: Auth.idToken, sid: S.sid, data: payload });
}
window.addEventListener('pagehide', flushOnLeave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushOnLeave(); });
window.addEventListener('beforeunload', (e) => {
  if (S.leaving) return;              // [나가기] 로 나가는 중이면 묻지 않습니다
  flushOnLeave();
  /* 영상을 보내는 중에 나가면 중간에 끊깁니다. 한 번 물어봅니다. */
  const busy = (typeof V !== 'undefined' && V.uploading);
  if (busy || (!S.submitted && countFilled(S.data) > 0)) {
    e.preventDefault(); e.returnValue = '';
  }
});

$('#btnSave').addEventListener('click', () => saveServerNow(true));

/* ---------- 나가기 ----------
   태블릿을 여러 명이 쓰거나, 다음 시간에 다른 상태로 시작해야 할 때 씁니다.
   이 단추를 누르면 이 기기에 남아 있던 내 작성 내용이 지워집니다.
   (서버에 저장된 것은 그대로 있어서 다시 로그인하면 이어서 쓸 수 있습니다.
    새로고침이나 실수로 탭을 닫은 것으로는 지워지지 않습니다.) */
$('#btnLogout').addEventListener('click', async () => {
  const n = countFilled(S.data);
  let warn;
  if (S.exam && !S.submitted) {
    warn = `⚠ 수행평가 중이고 아직 제출하지 않았습니다.\n\n` +
           `지금 나가면 지금까지 쓴 ${n}개가 모두 사라집니다.\n` +
           `평가 중에는 어디에도 저장되지 않습니다.\n\n정말 나가시겠습니까?`;
  } else if (S.submitted) {
    warn = '나가시겠습니까?\n\n이 기기에 남아 있는 내용은 지워집니다.';
  } else {
    warn = `아직 제출하지 않았습니다.\n\n지금 나가면 이 기기에 남아 있는 내용이 지워집니다.\n(작성 ${n}개 · 서버에 저장된 것은 남습니다)\n\n나가시겠습니까?`;
  }
  if (!confirm(warn)) return;

  const btn = $('#btnLogout');
  btn.disabled = true; btn.textContent = '정리 중…';

  /* 나가기 전에 마지막으로 한 번 서버에 보냅니다. (수업 시간이면 저장됩니다) */
  try { await saveServerNow(false); } catch (e) {}

  /* 이 기기에 남은 흔적을 지웁니다. */
  LS.del(keyMain());
  LS.del(keyPeer());
  LS.del(keySeen());

  /* 나가는 중에 '저장 안 됐다'는 경고창이 뜨지 않도록 표시해 둡니다. */
  S.leaving = true;
  S.data = {}; S.peer = []; S.seen = {};

  Auth.signOut();
  location.reload();
});

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

/** 평가 시간이 끝날 때 자동으로 냅니다.
    학생이 [지금 제출하기] 를 누르지 못한 채 시간이 지나 버리는 일을 막습니다. */
async function autoSubmit() {
  if (S.submitted) return;
  if (!S.data.q1 && countFilled(S.data) === 0) return;   // 아무것도 안 썼으면 내지 않습니다

  toast('시간이 다 되어 자동으로 제출합니다…', 'warn', 6000);
  const res = await apiPost('submit', {
    idToken: Auth.idToken, sid: S.sid, data: buildPayload(),
    peer: S.peer.filter(p => p.sid)
  });
  if (res && res.ok) {
    S.submitted = true;
    toast('자동으로 제출했습니다', 'ok', 6000);
    applyLock();
  } else {
    toast('자동 제출에 실패했습니다. [지금 제출하기] 를 눌러 주세요.', 'bad', 9000);
    S.autoSubmitted = false;      // 학생이 직접 낼 수 있게 다시 열어 둡니다
  }
}

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

  $('#btnSave').disabled = entryShut || S.exam;
  $('#btnSave').textContent = S.exam ? '평가 중 (저장 없음)' : '저장하기';
  $('#btnPeerAdd').disabled = entryShut;
  $('#btnPeerSave').disabled = entryShut;
  $('#btnSubmit').disabled = entryShut || submitShut || submittedLock;
  $('#btnSubmit').textContent = submittedLock ? '제출 완료' : '지금 제출하기';

  /* 내보내기와 인쇄는 언제나 됩니다. 학생이 자기 글을 못 가져가면 곤란하니까요. */
  $('#btnExport').disabled = false;

  /* 발표 영상도 수업 시간 안에서만 찍고 낼 수 있습니다. */
  if (typeof vApplyLock === 'function') vApplyLock();
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
    if (typeof r.exam === 'boolean') {
      if (r.exam !== S.exam) {
        S.exam = r.exam;
        document.body.classList.toggle('exam', S.exam);
      }
    }
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

  /* ── 평가 모드 ────────────────────────────────────────────────
     남은 시간을 크게 보여 주고, 끝나기 직전에 자동으로 제출합니다. */
  if (S.exam && c.entry && c.entry.open && c.entry.to) {
    const left = new Date(c.entry.to).getTime() - now;

    if (!S.submitted) {
      if (!S.warned5 && left <= 5 * 60000 && left > 60000) {
        S.warned5 = true;
        toast('5분 남았습니다. 마무리해 주세요.', 'warn', 6000);
      }
      if (!S.warned1 && left <= 60000 && left > 12000) {
        S.warned1 = true;
        toast('1분 남았습니다. 곧 자동으로 제출됩니다.', 'bad', 8000);
      }
      /* 마감 12초 전에 한 번 자동으로 냅니다. (서버 마감에 걸리지 않도록) */
      if (!S.autoSubmitted && left <= 12000) {
        S.autoSubmitted = true;
        autoSubmit();
      }
    }

    el.className = 'statusbar exam' + (left < 5 * 60000 ? ' wait' : '');
    el.textContent = (S.submitted ? '제출 완료 · ' : '') +
      `수행평가 중 · 남은 시간 ${fmtLeft(left)}` +
      (S.submitted ? '' : ' · 제출해야 남습니다');
    return;
  }
  if (S.exam && c.entry && !c.entry.open) {
    el.className = 'statusbar closed';
    el.textContent = S.submitted
      ? '수행평가가 끝났습니다 · 제출 완료'
      : '수행평가 시간이 끝났습니다';
    return;
  }

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

/* ===========================================================================
 *  11. 1분 발표 영상 — 찍고, 보고, 내기
 *
 *  왜 태블릿 카메라 앱을 쓰지 않고 여기서 찍나
 *   · 카메라 앱으로 찍으면 1분에 50~150MB 가 나옵니다. 한 학급이면 3GB 가
 *     넘어 학교 와이파이가 먼저 무너집니다.
 *   · 여기서 찍으면 config.js 에 적어 둔 화질로 고정되어 1분에 4MB 안팎입니다.
 *   · 60초가 되면 저절로 멈추므로 길이를 따로 재지 않아도 됩니다.
 *
 *  보내는 방법
 *   한 번에 보내지 않고 512KB 씩 나눠 보냅니다. 중간에 끊겨도 그 조각만
 *   다시 보내면 됩니다. 조각 크기가 3의 배수라 서버에서 글자를 그대로
 *   이어 붙이기만 하면 원래 영상이 됩니다.
 * ========================================================================= */

const V = {
  stream: null,      // 카메라
  rec: null,         // 녹화기
  chunks: [],        // 녹화 중 쌓이는 조각
  blob: null,        // 다 찍은 영상
  mime: '',          // 저장 형식
  seconds: 0,        // 찍은 길이
  timer: null,
  left: 0,
  uploading: false,
  sent: null,        // 이미 낸 영상 {url, at, sizeMB, seconds, retakes}
  retakes: 0,
  supported: true,
  canvas: null,      // 좌우 뒤집어 그리는 그림판
  mixed: null,       // 그림판 + 소리를 합친 신호
  drawId: null,      // 그리기 반복 번호
  savedMirrored: false  // 이번에 찍은 것이 뒤집혀 저장되었는지
};

/* 쓸 수 있는 형식. 앞에 있는 것부터 씁니다.
 *
 * 코덱까지 적은 것을 먼저 놓은 데는 까닭이 있습니다.
 * 그냥 'video/mp4' 만 물어보면 「된다」고 답하고서는 속에 엉뚱한 코덱(VP9)을
 * 넣는 브라우저가 있습니다. 그러면 이름은 .mp4 인데 구글 드라이브에서
 * 재생이 안 되는 파일이 나옵니다. 코덱을 못 박아 물어보면 그런 일이 없습니다.
 * 맨 아래 두 줄은 코덱을 따로 못 고르는 사파리(아이패드)를 위한 자리입니다. */
const V_MIME = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',   // 갤럭시탭·아이패드 — 어디서나 재생됨
  'video/mp4;codecs=avc1.4D401E,mp4a.40.2',
  'video/webm;codecs=h264,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/mp4',
  'video/webm'
];

const vEl = {};
function vGrab() {
  ['vState', 'vBox', 'vLive', 'vPlay', 'vHint', 'vClock', 'vRec', 'vPrompt',
   'vPromptToggle', 'vOptions', 'vMirror', 'vMirrorNote', 'vBar', 'vFill', 'vMsg',
   'btnVCam', 'btnVRec', 'btnVStop', 'btnVAgain', 'btnVSend'
  ].forEach(function (id) { vEl[id] = $('#' + id); });
}

/* ---------- 거울 보기 ----------
   카메라가 잡은 그대로 보여 주면 「남이 보는 나」라서 어색합니다.
   손을 오른쪽으로 들면 화면에서는 왼쪽으로 움직이니 더 그렇습니다.
   그래서 셀카처럼 좌우를 뒤집어 보여 줍니다.

   ★ 뒤집는 것은 화면뿐입니다.
   녹화기(MediaRecorder)는 카메라에서 오는 신호를 그대로 받아 적기 때문에,
   화면을 어떻게 꾸며 놓든 저장되는 영상은 안 뒤집힌 그대로입니다.
   교실에서 함께 볼 때 옷의 글씨나 뒤쪽 칠판 글씨가 뒤집히지 않습니다. */

const V_MIRROR_KEY = 'mj:mirror';        // 기기마다 기억합니다 (학생별이 아님)

function vMirrorOn() {
  const saved = LS.get(V_MIRROR_KEY, null);
  return (saved === null) ? !!VIDEO_MIRROR_DEFAULT : !!saved;
}

/** 이 기기가 「뒤집어서 저장」까지 할 수 있는지. (그림판 신호 뽑기가 되는지) */
function vCanMirrorSave() {
  try { return typeof document.createElement('canvas').captureStream === 'function'; }
  catch (e) { return false; }
}

/** 지금 저장까지 뒤집어야 하는 상황인가 */
function vMirrorSaving() {
  return !!(VIDEO_MIRROR_SAVE && vEl.vMirror && vEl.vMirror.checked && vCanMirrorSave());
}

function vApplyMirror() {
  const on = vEl.vMirror ? vEl.vMirror.checked : vMirrorOn();
  if (vEl.vLive) vEl.vLive.style.transform = on ? 'scaleX(-1)' : '';
  LS.set(V_MIRROR_KEY, on);

  /* 다시 보기(#vPlay)에는 절대 손대지 않습니다.
     저장까지 뒤집는 경우에는 파일 자체가 이미 뒤집혀 있고,
     아닌 경우에는 안 뒤집힌 것이 맞는 모습이기 때문입니다. */

  if (!vEl.vMirrorNote) return;
  if (!VIDEO_MIRROR_SAVE) {
    vEl.vMirrorNote.innerHTML =
      '화면만 뒤집습니다. <b>찍힌 영상은 뒤집히지 않습니다</b> — 남들이 보는 그대로 저장됩니다.';
  } else if (!vCanMirrorSave()) {
    vEl.vMirrorNote.innerHTML =
      '이 태블릿은 화면만 뒤집을 수 있습니다. <b>찍힌 영상은 뒤집히지 않습니다.</b>';
  } else if (on) {
    vEl.vMirrorNote.innerHTML =
      '<b>보이는 그대로 저장됩니다.</b> 옷이나 뒤쪽 칠판에 글씨가 있으면 그 글씨는 거꾸로 보입니다.';
  } else {
    vEl.vMirrorNote.innerHTML =
      '카메라가 잡은 그대로 — 남들이 보는 모습으로 저장됩니다.';
  }
}

/* ---------- 뒤집어서 저장하기 ----------
   녹화기는 카메라 신호를 그대로 받아 적기 때문에, 화면에 CSS 로 뒤집어 놓아도
   파일에는 묻지 않습니다. 그래서 저장까지 뒤집으려면 신호 자체를 바꿔야 합니다.

   ① 안 보이는 그림판(canvas)을 하나 두고
   ② 카메라 그림을 좌우로 뒤집어 거기에 계속 그리고
   ③ 그 그림판에서 새 영상 신호를 뽑아
   ④ 원래 소리와 합쳐 그것을 녹화합니다.

   그림 크기가 640×480 이라 태블릿에도 부담이 적습니다. */

function vBuildRecordStream() {
  if (!vMirrorSaving()) return V.stream;          // 그냥 카메라 신호를 씁니다

  try {
    const track = V.stream.getVideoTracks()[0];
    const s = track ? track.getSettings() : {};
    const w = s.width || VIDEO_WIDTH;
    const h = s.height || VIDEO_HEIGHT;

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.translate(w, 0);
    ctx.scale(-1, 1);                              // 여기서 좌우가 뒤집힙니다

    const draw = function () {
      try { ctx.drawImage(vEl.vLive, 0, 0, w, h); } catch (e) {}
      V.drawId = requestAnimationFrame(draw);
    };
    draw();

    const out = cv.captureStream(VIDEO_FPS);
    V.stream.getAudioTracks().forEach(function (t) { out.addTrack(t); });

    V.canvas = cv;
    V.mixed = out;
    return out;
  } catch (e) {
    vStopDraw();
    return V.stream;                               // 안 되면 그냥 카메라 신호로
  }
}

function vStopDraw() {
  if (V.drawId) { cancelAnimationFrame(V.drawId); V.drawId = null; }
  if (V.mixed) {
    /* 소리는 카메라 것을 빌려 쓴 것이라 끄지 않습니다. 그림판 신호만 끕니다. */
    V.mixed.getVideoTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
    V.mixed = null;
  }
  V.canvas = null;
}

/* ---------- 시작할 때 한 번 ---------- */
async function initVideo() {
  vGrab();
  if (!vEl.vBox) return;

  /* 이 기기가 녹화를 할 수 있는지 */
  const secure = window.isSecureContext;
  const hasGUM = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const hasMR = (typeof MediaRecorder !== 'undefined');
  V.supported = secure && hasGUM && hasMR;

  if (V.supported && MediaRecorder.isTypeSupported) {
    for (let i = 0; i < V_MIME.length; i++) {
      try { if (MediaRecorder.isTypeSupported(V_MIME[i])) { V.mime = V_MIME[i]; break; } }
      catch (e) {}
    }
  }

  if (!V.supported) {
    vState('이 태블릿에서는 앱 안에서 찍을 수 없습니다', 'wait');
    vMsg('선생님께 말씀해 주세요. 다른 태블릿으로 찍으면 됩니다.', 'bad');
    vEl.btnVCam.disabled = true;
    return;
  }

  vEl.btnVCam.addEventListener('click', vOpenCam);
  vEl.btnVRec.addEventListener('click', vStart);
  vEl.btnVStop.addEventListener('click', function () { vStop(true); });
  vEl.btnVAgain.addEventListener('click', vAgain);
  vEl.btnVSend.addEventListener('click', vSend);
  vEl.vPromptToggle.addEventListener('change', vRenderPrompt);

  /* 거울 보기 — 지난번에 고른 대로 시작합니다. */
  vEl.vMirror.checked = vMirrorOn();
  vEl.vMirror.addEventListener('change', vApplyMirror);
  vApplyMirror();

  /* 이미 낸 영상이 있는지 서버에 물어봅니다. */
  try {
    const r = await apiPost('videoMine', { idToken: Auth.idToken, sid: S.sid }, 12000);
    if (r && r.ok && r.video) {
      V.sent = r.video;
      V.retakes = Number(r.video.retakes || 0);
      vShowSent();
    }
  } catch (e) { /* 못 물어봐도 찍는 데는 지장이 없습니다 */ }

  vApplyLock();
}

/* ---------- 화면 표시 도우미 ---------- */
function vState(text, kind) {
  vEl.vState.textContent = text;
  vEl.vState.className = 'v-state ' + (kind || '');
}
function vMsg(text, kind) {
  vEl.vMsg.textContent = text || '';
  vEl.vMsg.className = 'v-msg ' + (kind || '');
}
function vShow(el, on) { if (el) el.hidden = !on; }
function vProgress(p) {
  vEl.vBar.hidden = false;
  vEl.vFill.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
}

/** 이미 낸 영상이 있을 때 카드 아래에 보여 줍니다. */
function vShowSent() {
  if (!V.sent) return;
  vState('영상을 냈습니다', 'ok');
  let box = $('#vDone');
  if (!box) {
    box = document.createElement('div');
    box.id = 'vDone'; box.className = 'v-done';
    vEl.vMsg.parentNode.appendChild(box);
  }
  box.innerHTML =
    `낸 시각 <b>${esc(String(V.sent.at || '').slice(5))}</b> · ` +
    `${esc(String(V.sent.seconds || 0))}초 · ${esc(String(V.sent.sizeMB || 0))}MB` +
    (V.retakes ? ` · 다시 찍기 ${V.retakes}회` : '') +
    `<br><span class="dim">더 잘 찍고 싶으면 [카메라 켜기] 로 다시 찍어 내면 됩니다. ` +
    `마지막에 낸 것만 남습니다.</span>`;
}

/** 9번 세 문장을 화면 아래에 띄웁니다. */
function vRenderPrompt() {
  const on = vEl.vPromptToggle && vEl.vPromptToggle.checked;
  const parts = String(S.data.q9 || '').split('\n');
  const any = parts.some(function (x) { return x && x.trim(); });
  if (!on || !any) { vShow(vEl.vPrompt, false); return; }
  vEl.vPrompt.innerHTML = Q9_LABEL.map(function (lb, k) {
    const t = parts[k] && parts[k].trim();
    return t ? `<p><b>${lb.slice(0, 1)}</b> ${esc(t)}</p>` : '';
  }).join('');
  vShow(vEl.vPrompt, true);
}

/* ---------- 카메라 켜기 ---------- */
async function vOpenCam() {
  const btn = vEl.btnVCam;
  btn.disabled = true; btn.textContent = '카메라를 여는 중…';
  vMsg('');

  try {
    V.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width:  { ideal: VIDEO_WIDTH },
        height: { ideal: VIDEO_HEIGHT },
        frameRate: { ideal: VIDEO_FPS, max: 30 }
      },
      audio: { echoCancellation: true, noiseSuppression: true }
    });
  } catch (e) {
    btn.disabled = false; btn.textContent = '다시 켜 보기';
    const why =
      e.name === 'NotAllowedError'  ? '카메라를 쓰겠다는 물음에 [허용] 을 눌러 주세요.' :
      e.name === 'NotFoundError'    ? '앞 카메라를 찾지 못했습니다. 선생님께 말씀해 주세요.' :
      e.name === 'NotReadableError' ? '다른 앱이 카메라를 쓰고 있습니다. 그 앱을 닫고 다시 해 보세요.' :
                                      '카메라를 켜지 못했습니다. 선생님께 말씀해 주세요.';
    vMsg(why, 'bad');
    return;
  }

  vEl.vLive.srcObject = V.stream;
  vEl.vLive.muted = true;
  vEl.vLive.play().catch(function () {});

  vShow(vEl.vLive, true);
  vShow(vEl.vPlay, false);
  vShow(vEl.vHint, false);
  vShow(vEl.btnVCam, false);
  vShow(vEl.btnVRec, true);
  vShow(vEl.vOptions, true);
  vApplyMirror();

  const at = V.stream.getAudioTracks()[0];
  vState('준비되었습니다', '');
  vMsg(at ? '[● 녹화 시작] 을 누르면 바로 찍습니다.'
          : '마이크가 잡히지 않았습니다. 소리 없이 찍힐 수 있습니다.', at ? '' : 'bad');
  vRenderPrompt();
}

function vStopCam() {
  vStopDraw();
  if (!V.stream) return;
  V.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
  V.stream = null;
}

/* ---------- 녹화 ---------- */
function vStart() {
  if (!V.stream || V.rec) return;

  V.chunks = []; V.blob = null;
  const old = $('#vDone'); if (old) old.remove();
  vEl.vBar.hidden = true;
  vMsg('');

  const opt = { videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: VIDEO_AUDIO_BPS };
  if (V.mime) opt.mimeType = V.mime;

  /* 거울로 저장할 상황이면 뒤집은 신호를, 아니면 카메라 신호를 그대로 녹화합니다. */
  V.savedMirrored = vMirrorSaving();
  const src = vBuildRecordStream();

  try { V.rec = new MediaRecorder(src, opt); }
  catch (e) {
    try { V.rec = new MediaRecorder(src); }            // 옵션을 거절하면 기본값으로
    catch (e2) {
      vStopDraw();
      vMsg('녹화를 시작하지 못했습니다. 선생님께 말씀해 주세요.', 'bad');
      V.rec = null; return;
    }
  }
  V.mime = V.rec.mimeType || V.mime || 'video/mp4';

  V.rec.ondataavailable = function (e) { if (e.data && e.data.size) V.chunks.push(e.data); };
  V.rec.onstop = vFinish;

  const t0 = Date.now();
  try { V.rec.start(1000); }
  catch (e) { vMsg('녹화를 시작하지 못했습니다.', 'bad'); V.rec = null; return; }

  vEl.vMirror.disabled = true;        // 찍는 도중에 바꾸면 영상이 섞입니다
  vShow(vEl.btnVRec, false);
  vShow(vEl.btnVStop, true);
  vShow(vEl.vClock, true);
  vShow(vEl.vRec, true);
  vState('찍는 중입니다', 'rec');
  vMsg('화면이 아니라 카메라를 보고 말하세요.');
  vRenderPrompt();

  V.left = VIDEO_SECONDS;
  vEl.vClock.textContent = fmtLeft(V.left * 1000);
  V.timer = setInterval(function () {
    V.left = Math.max(0, VIDEO_SECONDS - Math.round((Date.now() - t0) / 1000));
    vEl.vClock.textContent = fmtLeft(V.left * 1000);
    vEl.vClock.classList.toggle('over', V.left <= 10);
    if (V.left <= 0) vStop(false);
  }, 200);
}

/** manual 이 true 면 학생이 직접 멈춘 것입니다. */
function vStop(manual) {
  clearInterval(V.timer); V.timer = null;
  V.seconds = Math.max(1, VIDEO_SECONDS - V.left);
  vShow(vEl.vClock, false);
  vShow(vEl.vRec, false);
  vShow(vEl.btnVStop, false);
  if (V.rec && V.rec.state !== 'inactive') { try { V.rec.stop(); } catch (e) {} }
  if (!manual) vMsg('60초가 되어 저절로 멈췄습니다.');
}

function vFinish() {
  V.rec = null;
  vStopDraw();
  vEl.vMirror.disabled = false;
  V.blob = new Blob(V.chunks, { type: (V.mime || 'video/mp4').split(';')[0] });
  V.chunks = [];

  vShow(vEl.vLive, false);
  vShow(vEl.vPrompt, false);
  vShow(vEl.vPlay, true);
  vEl.vPlay.src = URL.createObjectURL(V.blob);
  vEl.vPlay.muted = false;

  vShow(vEl.btnVAgain, true);
  vShow(vEl.btnVSend, true);

  const mb = (V.blob.size / 1048576).toFixed(1);
  vState('찍었습니다 · 아직 내지 않았습니다', 'wait');
  /* 거울로 보다가 저장은 안 뒤집히는 경우에만, 좌우가 달라 보이는 게 맞다고 알려 줍니다. */
  const mirrorNote = (vEl.vMirror && vEl.vMirror.checked && !V.savedMirrored)
    ? ' 아까와 좌우가 바뀐 것처럼 보이는 게 맞습니다 — 이게 남들이 보는 모습입니다.' : '';
  vMsg(`${V.seconds}초 · ${mb}MB — 한 번 보고, 괜찮으면 [이 영상 내기] 를 누르세요.` + mirrorNote);
  vApplyLock();
}

function vAgain() {
  if (V.uploading) return;
  if (VIDEO_RETAKE_LIMIT && V.retakes >= VIDEO_RETAKE_LIMIT) {
    vMsg(`다시 찍기는 ${VIDEO_RETAKE_LIMIT}번까지입니다.`, 'bad');
    return;
  }
  V.blob = null; V.seconds = 0;
  try { URL.revokeObjectURL(vEl.vPlay.src); } catch (e) {}
  vEl.vPlay.removeAttribute('src');
  vShow(vEl.vPlay, false);
  vShow(vEl.vLive, true);
  vShow(vEl.btnVAgain, false);
  vShow(vEl.btnVSend, false);
  vEl.vBar.hidden = true;
  vMsg('');
  if (V.stream) { vShow(vEl.btnVRec, true); vState('준비되었습니다', ''); vRenderPrompt(); }
  else { vShow(vEl.btnVCam, true); vEl.btnVCam.disabled = false;
         vEl.btnVCam.textContent = '카메라 켜기'; vState('아직 찍지 않았습니다', ''); }
}

/* ---------- 보내기 ---------- */

/** 조각 하나를 base64 글자로 바꿉니다. */
function vToB64(part) {
  return new Promise(function (resolve, reject) {
    const fr = new FileReader();
    fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); };
    fr.onerror = function () { reject(new Error('영상을 읽지 못했습니다')); };
    fr.readAsDataURL(part);
  });
}
const vSleep = ms => new Promise(r => setTimeout(r, ms));

async function vSend() {
  if (!V.blob || V.uploading) return;

  V.uploading = true;
  vEl.btnVSend.disabled = true;
  vEl.btnVAgain.disabled = true;
  vState('보내는 중입니다', 'wait');
  vMsg('보내는 동안 화면을 끄거나 나가지 마세요.');
  vProgress(0.02);

  const fail = function (text) {
    V.uploading = false;
    vEl.btnVSend.disabled = false;
    vEl.btnVAgain.disabled = false;
    vState('보내지 못했습니다', 'wait');
    vMsg(text + ' — 찍은 영상은 그대로 있습니다. [이 영상 내기] 를 한 번 더 눌러 보세요.', 'bad');
  };

  try {
    /* 1. 자리 잡기 */
    const init = await apiPost('videoInit', {
      idToken: Auth.idToken, sid: S.sid,
      bytes: V.blob.size, seconds: V.seconds, mime: V.mime
    }, 30000);
    if (!init || !init.ok) { fail(errText(init)); return; }

    const size = Number(init.chunkSize) || 524286;
    const total = Math.ceil(V.blob.size / size);

    /* 2. 조각 보내기 (한 조각당 세 번까지 다시 해 봅니다) */
    for (let i = 0; i < total; i++) {
      const part = V.blob.slice(i * size, Math.min((i + 1) * size, V.blob.size));
      const b64 = await vToB64(part);

      let ok = false, last = null;
      for (let t = 0; t < 3 && !ok; t++) {
        const r = await apiPost('videoChunk', {
          idToken: Auth.idToken, sid: S.sid, upId: init.upId, seq: i, b64: b64
        }, 90000);
        if (r && r.ok) ok = true;
        else { last = r; await vSleep(800 * (t + 1)); }
      }
      if (!ok) { fail(errText(last)); return; }

      vProgress(0.02 + (i + 1) / total * 0.9);
      vMsg(`보내는 중… ${Math.round((i + 1) / total * 100)}%`);
    }

    /* 3. 이어 붙이기 */
    vMsg('마무리하는 중…');
    const done = await apiPost('videoDone', {
      idToken: Auth.idToken, sid: S.sid, upId: init.upId,
      total: total, seconds: V.seconds, mime: V.mime
    }, 120000);

    if (!done || !done.ok) { fail(errText(done)); return; }

    vProgress(1);
    V.sent = { at: done.at, url: done.url, seconds: V.seconds,
               sizeMB: done.sizeMB, retakes: done.retakes };
    V.retakes = Number(done.retakes || 0);
    V.uploading = false;
    vEl.btnVAgain.disabled = false;
    vShow(vEl.btnVSend, false);
    vMsg('');
    vShowSent();
    toast('발표 영상을 냈습니다', 'ok', 4000);
    setTimeout(function () { vEl.vBar.hidden = true; }, 1200);

  } catch (e) {
    fail(String(e.message || e));
  }
}

/* ---------- 잠금 ---------- */
/** 수업 시간이 아니면 찍지도 내지도 못하게 합니다. */
function vApplyLock() {
  if (!vEl.vBox || !V.supported) return;
  const shut = !!(S.cfg && S.cfg.entry && !S.cfg.entry.open);

  [vEl.btnVCam, vEl.btnVRec, vEl.btnVSend].forEach(function (b) {
    if (b) b.disabled = shut || V.uploading;
  });
  if (vEl.btnVAgain) vEl.btnVAgain.disabled = V.uploading;

  if (shut && V.stream) {                      // 수업이 끝나면 카메라를 끕니다
    if (V.rec) vStop(false);
    vStopCam();
    vShow(vEl.vLive, false);
    if (!V.blob) vShow(vEl.vHint, true);
    vShow(vEl.btnVRec, false);
    vShow(vEl.btnVCam, true);
    vEl.btnVCam.textContent = '카메라 켜기';
  }
  if (shut && !V.sent && !V.blob) vState('수업 시간에만 찍을 수 있습니다', 'wait');
}

/* 탭을 닫거나 화면을 나갈 때 카메라를 끕니다. */
window.addEventListener('pagehide', vStopCam);
