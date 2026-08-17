/* ============================================================================
 *  app.js — 학생 화면
 *  버전: student v1.0.0 (2026-08-17)
 * ==========================================================================*/

const APP_VERSION = 'student v1.3.0 (2026-08-17) 평가모드';
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
  if (!S.submitted && countFilled(S.data) > 0) { e.preventDefault(); e.returnValue = ''; }
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
