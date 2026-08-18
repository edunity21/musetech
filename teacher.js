/* ============================================================================
 *  teacher.js — 수업자용 화면
 *  버전: teacher v1.0.0 (2026-08-17)
 * ==========================================================================*/

const TEACHER_VERSION = 'teacher v1.8.0 (2026-08-18) 계정목록붙여넣기';
console.log('%c' + TEACHER_VERSION, 'background:#F5A524;color:#000;padding:2px 8px;border-radius:4px');
console.log('서버 주소:', SERVER_URL);

const T = {
  email: '',
  cfg: {},            // 설정 시트에 적힌 값   { '전체': {...}, '3-1': {...} }
  states: {},         // 서버가 계산한 지금 상태 { '3-1': {entry:{...}, submit:{...}} }
  rows: [],           // 현황
  roster: [],
  cls: CLASS_LIST[0],
  timerRefresh: null,
  lastActive: Date.now()
};

$('#verLine').textContent = TEACHER_VERSION;

/* ===========================================================================
 *  1. 로그인 · 자동 로그아웃
 * ========================================================================= */

/* 1단계 · 구글 로그인이 끝나면 2단계(비밀번호) 칸을 엽니다. */
Auth.render($('#gsiBtn'), (p) => {
  $('#gateMsg').innerHTML = `<span class="dim"><b>${esc(p.email)}</b> 로 로그인했습니다.</span>`;
  $('#step2').classList.remove('off');
  $('#inTpw').focus();
});

/* 2단계 · 수업자용 비밀번호 */
$('#btnTEnter').addEventListener('click', doTeacherEnter);
$('#inTpw').addEventListener('keydown', e => { if (e.key === 'Enter') doTeacherEnter(); });

async function doTeacherEnter() {
  const pw = $('#inTpw').value;
  if (!Auth.alive()) {
    $('#gateMsg').innerHTML = '<span class="err">먼저 구글 로그인을 해 주세요.</span>';
    return;
  }
  if (!pw) {
    $('#gateMsg').innerHTML = '<span class="err">비밀번호를 적어 주세요.</span>';
    return;
  }

  const btn = $('#btnTEnter');
  btn.disabled = true; btn.textContent = '확인하는 중…';
  $('#gateMsg').textContent = '';

  const res = await apiPost('teacherHello', { idToken: Auth.idToken, pw });

  btn.disabled = false; btn.textContent = '들어가기';

  if (!res || !res.ok) {
    $('#gateMsg').innerHTML = `<span class="err">${esc(errText(res))}</span>`;
    $('#inTpw').value = '';
    $('#inTpw').focus();
    /* 비밀번호만 틀린 것이면 구글 로그인은 그대로 두어, 다시 치기만 하면 되게 합니다. */
    if (res && res.error !== 'WRONG_TEACHER_PW') Auth.signOut();
    return;
  }

  T.email = Auth.email;
  $('#inTpw').value = '';
  $('#gateMsg').textContent = '';
  $('#gate').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#whoBox').innerHTML = esc(T.email);
  $('#serverLine').textContent = `서버 ${res.version} · 시트 연결됨`;
  boot();
}

/* 20분 동안 아무 조작이 없으면 로그아웃합니다. */
['click', 'keydown', 'touchstart', 'mousemove'].forEach(ev =>
  document.addEventListener(ev, () => { T.lastActive = Date.now(); }, { passive: true }));

setInterval(() => {
  if (!T.email) return;
  const idle = Date.now() - T.lastActive;
  const limit = TEACHER_IDLE_MINUTES * 60000;
  const left = limit - idle;
  $('#idleBar').className = 'statusbar ' + (left < 120000 ? 'closed' : 'open');
  $('#idleBar').textContent = left < 120000
    ? `조작이 없어 ${fmtLeft(left)} 뒤 자동 로그아웃됩니다`
    : `수업자용 화면 · 조작이 없으면 ${TEACHER_IDLE_MINUTES}분 뒤 자동 로그아웃`;
  if (left <= 0) location.reload();
}, 1000);

/* 탭 이동 */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  const name = t.dataset.tab;
  $$('.tab').forEach(x => x.setAttribute('aria-selected', String(x === t)));
  ['control', 'status', 'roster', 'learn', 'log'].forEach(n => $('#panel-' + n).hidden = (n !== name));
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (name === 'status') loadStatus();
  if (name === 'roster') loadRoster();
  if (name === 'learn') renderLearn();
}));

function boot() {
  $('#selClass').innerHTML = CLASS_LIST.map(c =>
    `<option value="${c}">${c}</option>`).join('');
  $('#selClass').value = T.cls;
  loadConfig();
  startAuto();
}
/* ===========================================================================
 *  2. 수업 통제 — 입장(수업 시간)과 제출을 따로 여닫습니다
 * ========================================================================= */

/** 수업 한 차시 길이(분). [수업 시작] 을 누르면 이만큼 열립니다. */
const LESSON_MINUTES = 50;
/** [제출 열기] 를 누르면 열리는 시간(분). */
const SUBMIT_MINUTES = 25;
/** [평가 시작] 을 누르면 열리는 수행평가 시간(분). */
const EXAM_MINUTES = 30;

async function loadConfig(quiet) {
  const res = await apiPost('teacherConfig', { idToken: Auth.idToken });
  if (!res || !res.ok) { if (!quiet) toast(errText(res), 'bad'); return; }
  T.cfg = res.config || {};
  T.states = res.states || {};
  renderQuick();
  renderConfig();
}

function cfgOf(cls) {
  return T.cfg[cls] || { entry: '', entryFrom: '', entryTo: '',
                         submit: '', resubmit: '', submitFrom: '', submitTo: '',
                         notice: '', exam: '' };
}

/** 시각을 시트에 적는 형식으로 */
const whenText = d => fmtDT(d);
const plusMin = (m) => new Date(Date.now() + m * 60000);

/* ---------- 위쪽: 단추 하나로 하는 조작 ---------- */

function renderQuick() {
  $('#quickTable tbody').innerHTML = CLASS_LIST.map(c => {
    const st = (T.states && T.states[c]) || null;
    const e = st ? st.entry : null;
    const sub = st ? st.submit : null;

    const isExam   = !!(st && st.exam);
    const lessonOn = !!(e && e.open);
    const subOn    = !!(sub && sub.open);

    /* ---- 지금 상태를 낱말로 ---- */
    let chips = '';
    if (isExam && lessonOn) {
      chips = '<span class="chip exam">● 수행평가 중</span>';
    } else {
      chips = lessonOn
        ? '<span class="chip on-lesson">● 수업 열림</span>'
        : '<span class="chip off">○ 수업 닫힘</span>';
      chips += subOn
        ? '<span class="chip on-submit">● 제출 열림</span>'
        : '<span class="chip off">○ 제출 닫힘</span>';
    }
    if (e && e.reason === 'ENTRY_BEFORE') chips = '<span class="chip wait">◐ 시작 대기</span>';
    if (e && e.reason === 'ENTRY_AFTER')  chips = '<span class="chip off">○ 시간 끝남</span>';

    let until = '';
    if (lessonOn && e.to)  until += `<div class="until">수업 종료 ${esc(fmtDT(e.to).slice(11))}</div>`;
    if (subOn && sub.to)   until += `<div class="until">제출 마감 ${esc(fmtDT(sub.to).slice(11))}</div>`;

    /* ---- 좌우 토글 : 켜진 쪽이 밝게 채워집니다 ---- */
    const seg = (kind, onNow, aOn, aOff, labOn, labOff) => `
      <div class="seg seg-${kind} ${onNow ? 'is-on' : 'is-off'}">
        <button class="seg-b b-on"  data-a="${aOn}">${labOn}</button>
        <button class="seg-b b-off" data-a="${aOff}">${labOff}</button>
      </div>`;

    return `<tr data-c="${c}" class="${isExam ? 'row-exam' : (lessonOn ? 'row-on' : '')}">
      <td class="cls"><b>${c}</b></td>
      <td class="stat">${chips}${until}</td>
      <td>${seg('lesson', lessonOn && !isExam, 'lesson',  'lessonEnd', '수업 열기', '닫기')}</td>
      <td>${seg('submit', subOn && !isExam,    'subOpen', 'subShut',   '제출 열기', '닫기')}</td>
      <td>${seg('exam',   isExam,              'exam',    'examEnd',   '평가 시작', '종료')}</td>
      <td class="num"><button class="btn sm both-b" data-a="both">수업+제출<br>함께 열기</button></td>
    </tr>`;
  }).join('');

  $$('#quickTable [data-a]').forEach(b =>
    b.addEventListener('click', () => quick(b.closest('tr').dataset.c, b.dataset.a)));

  renderSummary();
}

/** 지금 어느 반이 열려 있는지 한 줄로. 화면 위쪽에 늘 떠 있습니다. */
function renderSummary() {
  const lesson = [], submit = [], exam = [];
  CLASS_LIST.forEach(c => {
    const st = (T.states && T.states[c]) || null;
    if (!st) return;
    if (st.exam && st.entry.open) { exam.push(c); return; }
    if (st.entry.open)  lesson.push(c);
    if (st.submit.open) submit.push(c);
  });
  const box = (lab, arr, kind) =>
    `<span class="sum-item ${arr.length ? kind : 'none'}">
       <b>${lab}</b> ${arr.length ? arr.join(', ') : '없음'}</span>`;

  $('#quickSummary').innerHTML =
    box('수업 열림', lesson, 'lesson') +
    box('제출 열림', submit, 'submit') +
    box('수행평가', exam, 'exam') +
    `<span class="sum-time">${fmtDT(new Date()).slice(11)} 기준</span>`;
}

/* ---------- 사라지지 않는 조작 기록 ---------- */
const OPS = [];
function logOp(text, kind) {
  OPS.unshift({ t: fmtDT(new Date()).slice(11), text: text, kind: kind || '' });
  if (OPS.length > 10) OPS.pop();
  const el = $('#opLog');
  if (!el) return;
  el.innerHTML = OPS.map(o =>
    `<div class="op ${o.kind}"><span class="op-t">${o.t}</span>${esc(o.text)}</div>`).join('');
}

/** 단추를 누른 즉시 화면부터 바꿉니다. 서버 응답은 그 뒤에 맞춰 넣습니다.
    (누른 것 같은데 아무 반응이 없어 두 번 누르는 일을 막습니다) */
function optimistic(cls, what) {
  if (!T.states) T.states = {};
  const st = T.states[cls] || { entry: {}, submit: {}, exam: false };
  const mk = (open) => ({ open: open, reason: open ? '' : 'CLOSED', to: st.entry && st.entry.to });

  if (what === 'lesson')         { st.entry = mk(true);  st.exam = false; }
  else if (what === 'lessonEnd') { st.entry = mk(false); st.submit = mk(false); st.exam = false; }
  else if (what === 'subOpen')   { st.submit = mk(true); }
  else if (what === 'subShut')   { st.submit = mk(false); }
  else if (what === 'both')      { st.entry = mk(true); st.submit = mk(true); st.exam = false; }
  else if (what === 'exam')      { st.entry = mk(true); st.submit = mk(true); st.exam = true; }
  else if (what === 'examEnd')   { st.entry = mk(false); st.submit = mk(false); st.exam = false; }

  T.states[cls] = st;
  renderQuick();
  const tr = $(`#quickTable tr[data-c="${cls}"]`);
  if (tr) tr.classList.add('busy');
}

/** 빠른 조작 한 번 = 설정 한 줄 고치기 */
async function quick(cls, what) {
  let patch, msg;

  if (what === 'lesson') {
    patch = { entryMin: LESSON_MINUTES, submit: 'N', submitFrom: '', submitTo: '' };
    msg = `${cls} 수업을 열었습니다 · ${LESSON_MINUTES}분 (제출은 아직 닫힘)`;

  } else if (what === 'lessonEnd') {
    patch = { entry: 'N', entryFrom: '', entryTo: '', submit: 'N', submitFrom: '', submitTo: '' };
    msg = `${cls} 수업을 종료했습니다`;

  } else if (what === 'subOpen') {
    const st = (T.states && T.states[cls]) || null;
    if (!st || !st.entry.open) {
      if (!confirm(`${cls} 은 지금 수업이 열려 있지 않습니다.\n수업도 함께 열까요?`)) return;
      return quick(cls, 'both');
    }
    patch = { submitMin: SUBMIT_MINUTES };
    msg = `${cls} 제출을 열었습니다 · ${SUBMIT_MINUTES}분`;

  } else if (what === 'exam') {
    /* ── 수행평가 시작 ────────────────────────────────────────────
       입장·제출을 같은 시각에 함께 열고, 평가모드를 켭니다.
       평가모드에서는 학생 화면이 백지로 시작하고
       태블릿·서버 어디에도 임시저장이 남지 않습니다. */
    if (!confirm(
      `${cls} 수행평가를 시작합니다.\n\n` +
      `· ${EXAM_MINUTES}분 동안 열립니다\n` +
      `· 학생 화면은 백지에서 시작합니다 (이전에 쓴 내용 안 불러옴)\n` +
      `· 태블릿에도 서버에도 임시저장이 남지 않습니다\n` +
      `· 시간이 끝나면 자동으로 제출됩니다\n\n시작할까요?`)) return;
    patch = { exam: 'Y', entryMin: EXAM_MINUTES, submitMin: EXAM_MINUTES, resubmit: 'N' };
    msg = `${cls} 수행평가를 시작했습니다 · ${EXAM_MINUTES}분`;

  } else if (what === 'examEnd') {
    patch = { exam: 'N',
              entry: 'N', entryFrom: '', entryTo: '',
              submit: 'N', submitFrom: '', submitTo: '' };
    msg = `${cls} 수행평가를 종료했습니다`;

  } else if (what === 'subShut') {
    patch = { submit: 'N', submitFrom: '', submitTo: '' };
    msg = `${cls} 제출을 닫았습니다`;

  } else if (what === 'both') {
    patch = { entryMin: LESSON_MINUTES, submitMin: SUBMIT_MINUTES };
    msg = `${cls} 수업 ${LESSON_MINUTES}분 · 제출 ${SUBMIT_MINUTES}분을 함께 열었습니다`;
  } else return;

  optimistic(cls, what);          // 먼저 화면부터 바꿉니다

  const res = await apiPost('teacherSetConfig', { idToken: Auth.idToken, cls, patch });
  if (res && res.ok) {
    T.cfg = res.config || T.cfg;
    T.states = res.states || T.states;
    renderQuick(); renderConfig();

    /* 서버가 정말로 그렇게 바꿨는지 확인해서 기록에 남깁니다.
       "눌렀는데 안 바뀐" 경우를 놓치지 않기 위해서입니다. */
    const now = (T.states && T.states[cls]) || null;
    const wantOpen = ['lesson', 'both', 'exam', 'subOpen'].indexOf(what) >= 0;
    const gotOpen = !!(now && (what === 'subOpen' ? now.submit.open : now.entry.open));
    if (wantOpen && !gotOpen) {
      const why = now ? (now.entry.reason || now.submit.reason || '') : '응답 없음';
      logOp(`${msg} … 그런데 서버는 아직 닫힘 (${why})`, 'warn');
      toast(`${cls} 이 열리지 않았습니다 (${why}) — 조작 기록을 보세요`, 'warn', 8000);
    } else {
      logOp(msg, 'ok');
      toast(msg, 'ok', 4000);
    }
  } else {
    const t = errText(res);
    logOp(`${cls} 실패 — ${t}`, 'bad');
    toast(t, 'bad', 8000);
    loadConfig(true);             // 실패했으면 서버 상태로 되돌립니다
  }
}

$('#btnReloadCfg').addEventListener('click', () => loadConfig());

$('#btnCloseAll').addEventListener('click', async () => {
  if (!confirm('모든 학급의 수업과 제출을 닫습니다.\n작성 중이던 학생은 더 이상 서버에 저장되지 않습니다.\n\n진행할까요?')) return;
  const shut = { entry: 'N', entryFrom: '', entryTo: '', submit: 'N', submitFrom: '', submitTo: '' };
  const patches = { '전체': shut };
  CLASS_LIST.forEach(c => patches[c] = shut);
  const res = await apiPost('teacherSetConfigAll', { idToken: Auth.idToken, patches });
  if (res && res.ok) {
    toast('모든 학급을 닫았습니다', 'ok');
    T.cfg = res.config; T.states = res.states || T.states;
    renderQuick(); renderConfig();
  } else toast(errText(res), 'bad');
});

/* ---------- 아래쪽: 손으로 고치기 ---------- */

function renderConfig() {
  const g = cfgOf('전체');
  $('#globalRow').innerHTML = `
    <label class="switch"><input type="checkbox" id="gEntry" ${g.entry === 'Y' ? 'checked' : ''}>
      <span class="track2"></span><span class="lb">입장 허용</span></label>
    <label class="field"><span>입장 시작</span>
      <input class="t-input" id="gEntryFrom" type="text" placeholder="비우면 제한 없음"
             value="${esc(g.entryFrom)}" style="width:175px"></label>
    <label class="field"><span>입장 마감</span>
      <input class="t-input" id="gEntryTo" type="text" placeholder="비우면 제한 없음"
             value="${esc(g.entryTo)}" style="width:175px"></label>

    <label class="switch"><input type="checkbox" id="gSubmit" ${g.submit === 'Y' ? 'checked' : ''}>
      <span class="track2"></span><span class="lb">제출 허용</span></label>
    <label class="switch"><input type="checkbox" id="gRe" ${g.resubmit === 'Y' ? 'checked' : ''}>
      <span class="track2"></span><span class="lb">다시 내기 허용</span></label>
    <label class="field"><span>제출 시작</span>
      <input class="t-input" id="gSubFrom" type="text" placeholder="비우면 제한 없음"
             value="${esc(g.submitFrom)}" style="width:175px"></label>
    <label class="field"><span>제출 마감</span>
      <input class="t-input" id="gSubTo" type="text" placeholder="비우면 제한 없음"
             value="${esc(g.submitTo)}" style="width:175px"></label>

    <label class="field" style="flex:1 1 220px"><span>학생 화면에 띄울 공지</span>
      <input class="t-input" id="gNotice" type="text" value="${esc(g.notice)}"
             placeholder="예) 5번 문항 출처 두 곳 이상"></label>`;

  const sel = (k, v, yes, no) => `
    <select class="t-select" data-k="${k}" style="min-width:92px">
      <option value=""  ${v === '' ? 'selected' : ''}>기본값</option>
      <option value="Y" ${v === 'Y' ? 'selected' : ''}>${yes}</option>
      <option value="N" ${v === 'N' ? 'selected' : ''}>${no}</option>
    </select>`;

  $('#clsTable tbody').innerHTML = CLASS_LIST.map(c => {
    const v = cfgOf(c);
    return `<tr data-c="${c}">
      <td><b>${c}</b></td>
      <td>${sel('entry', v.entry, '열림', '닫힘')}</td>
      <td><input class="t-input" data-k="entryFrom" type="text" value="${esc(v.entryFrom)}"
                 placeholder="기본값" style="width:160px"></td>
      <td><input class="t-input" data-k="entryTo" type="text" value="${esc(v.entryTo)}"
                 placeholder="기본값" style="width:160px"></td>
      <td>${sel('submit', v.submit, '열림', '닫힘')}</td>
      <td>${sel('resubmit', v.resubmit, '허용', '금지')}</td>
      <td><input class="t-input" data-k="submitFrom" type="text" value="${esc(v.submitFrom)}"
                 placeholder="기본값" style="width:160px"></td>
      <td><input class="t-input" data-k="submitTo" type="text" value="${esc(v.submitTo)}"
                 placeholder="기본값" style="width:160px"></td>
      <td><input class="t-input" data-k="notice" type="text" value="${esc(v.notice)}"
                 placeholder="이 학급에만" style="min-width:150px"></td>
    </tr>`;
  }).join('');
}

$('#btnSaveCfg').addEventListener('click', async () => {
  const patches = {};
  patches['전체'] = {
    entry:      $('#gEntry').checked ? 'Y' : 'N',
    entryFrom:  $('#gEntryFrom').value.trim(),
    entryTo:    $('#gEntryTo').value.trim(),
    submit:     $('#gSubmit').checked ? 'Y' : 'N',
    resubmit:   $('#gRe').checked ? 'Y' : 'N',
    submitFrom: $('#gSubFrom').value.trim(),
    submitTo:   $('#gSubTo').value.trim(),
    notice:     $('#gNotice').value.trim()
  };
  $$('#clsTable tbody tr').forEach(tr => {
    const o = {};
    $$('[data-k]', tr).forEach(el => o[el.dataset.k] = el.value.trim());
    patches[tr.dataset.c] = o;
  });

  const res = await apiPost('teacherSetConfigAll', { idToken: Auth.idToken, patches });
  if (res && res.ok) {
    toast('설정을 저장했습니다', 'ok');
    T.cfg = res.config; T.states = res.states || T.states;
    renderQuick(); renderConfig();
  } else toast(errText(res), 'bad');
});

/* ===========================================================================
 *  3. 제출 현황
 * ========================================================================= */

$('#selClass').addEventListener('change', e => { T.cls = e.target.value; loadStatus(); });
$('#btnRefresh').addEventListener('click', loadStatus);
$('#findBox').addEventListener('input', renderStatus);
$('#autoRefresh').addEventListener('change', startAuto);

function startAuto() {
  clearInterval(T.timerRefresh);
  if ($('#autoRefresh') && $('#autoRefresh').checked) {
    T.timerRefresh = setInterval(() => {
      if (!$('#panel-status').hidden) loadStatus(true);
      if (!$('#panel-control').hidden) loadConfig(true);
    }, 10000);
  }
}

async function loadStatus(quiet) {
  const res = await apiPost('teacherStatus', { idToken: Auth.idToken, cls: T.cls });
  if (!res || !res.ok) { if (!quiet) toast(errText(res), 'bad'); return; }
  T.rows = res.rows || [];
  renderStatus();
}

function renderStatus() {
  const q = ($('#findBox').value || '').trim().toLowerCase();
  const rows = T.rows.filter(r =>
    !q || String(r.sid).includes(q) || String(r.name).toLowerCase().includes(q));

  const done = T.rows.filter(r => r.state === 'done').length;
  const draft = T.rows.filter(r => r.state === 'draft').length;
  $('#kTotal').textContent = T.rows.length;
  $('#kDone').textContent = done;
  $('#kDraft').textContent = draft;
  $('#kNone').textContent = T.rows.length - done - draft;

  $('#stTable tbody').innerHTML = rows.map(r => {
    const b = r.state === 'done' ? '<span class="badge done">제출</span>'
            : r.state === 'draft' ? '<span class="badge draft">작성 중</span>'
            : '<span class="badge none">시작 안 함</span>';
    return `<tr>
      <td class="num">${esc(r.sid)}</td>
      <td>${esc(r.name)}</td>
      <td>${b}${r.count > 1 ? ` <span class="dim">${r.count}회</span>` : ''}</td>
      <td>${esc(r.field || '')}</td>
      <td class="num">${r.progress != null ? r.progress + '/9' : ''}</td>
      <td class="num dim">${esc(r.at ? String(r.at).slice(5, 16) : '')}</td>
      <td class="dim" style="font-size:.8rem">${esc(r.email || '')}</td>
      <td>${r.state === 'none' ? '' :
        `<button class="btn sm" data-view="${esc(r.sid)}">보기</button>`}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="dim">해당하는 학생이 없습니다.</td></tr>';

  $$('#stTable [data-view]').forEach(b =>
    b.addEventListener('click', () => viewAnswer(b.dataset.view)));
}

const Q_TITLES = ['어떤 분야를 골랐나요?', '그 분야를 고른 이유는?',
  '이 산업은 무엇을 하는 곳인가요?', '이 산업에는 어떤 직업이 있나요?',
  '조사한 곳', '음악은 어떤 장면에 쓰이나요?', '음악이 없다면 무엇이 사라질까요?',
  '이 분야와 나를 이어 주는 점', '발표용 핵심 세 문장'];

function viewAnswer(sid) {
  const r = T.rows.find(x => String(x.sid) === String(sid));
  if (!r) return;
  const d = r.data || {};
  $('#vmTitle').textContent = `${r.sid} ${r.name} · ${r.field || '분야 미선택'}`;
  $('#vmBody').innerHTML = `
    <p class="dim">${r.state === 'done' ? '제출본' : '작성 중(임시저장본)'} ·
       마지막 ${esc(r.at || '')} · 작성 ${r.progress || 0}/9
       ${r.count > 1 ? ' · ' + r.count + '회 제출' : ''}</p>
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => {
      const v = n === 1 ? (d.q1name || d.q1 || '') : (d['q' + n] || '');
      const mark = (n === 7) ? ' ★ 상·중을 가르는 문항' : '';
      return `<div class="answer">
        <div class="an-q">${n}. ${esc(Q_TITLES[n - 1])}${mark}</div>
        <div class="an-a">${esc(v) || '<span class="dim">비어 있음</span>'}</div>
      </div>`;
    }).join('')}`;
  $('#viewModal').hidden = false;
}
$('#vmClose').addEventListener('click', () => $('#viewModal').hidden = true);
$('#viewModal').addEventListener('click', e => {
  if (e.target.id === 'viewModal') $('#viewModal').hidden = true;
});

/* ---------- 내려받기 ---------- */
const csvQ = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

function rowsToCsv(rows) {
  const head = ['학급', '학번', '이름', '상태', '제출횟수', '작성수', '마지막시각', '계정',
    '고른분야', '2.고른이유', '3.무슨일', '4.직업', '5.출처',
    '6.쓰이는장면', '7.없다면', '8.나와의연결', '9.핵심세문장', '모둠', '순서'];
  const body = rows.map(r => {
    const d = r.data || {};
    return [r.cls, r.sid, r.name,
      r.state === 'done' ? '제출' : (r.state === 'draft' ? '작성중' : '미시작'),
      r.count || 0, r.progress || 0, r.at || '', r.email || '',
      d.q1name || '', d.q2 || '', d.q3 || '', d.q4 || '', d.q5 || '',
      d.q6 || '', d.q7 || '', d.q8 || '', String(d.q9 || '').replace(/\n/g, ' / '),
      d.group || '', d.order || ''].map(csvQ).join(',');
  });
  return '\uFEFF' + head.map(csvQ).join(',') + '\r\n' + body.join('\r\n');
}

function dl(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

$('#btnCsvClass').addEventListener('click', () => {
  dl(`음악산업탐구_${T.cls}_${fmtDT(new Date()).replace(/[: ]/g, '')}.csv`, rowsToCsv(T.rows));
  toast('CSV를 내려받았습니다', 'ok');
});

$('#btnCsvAll').addEventListener('click', async () => {
  toast('전체 학급을 모으는 중…');
  const all = [];
  for (const c of CLASS_LIST) {
    const res = await apiPost('teacherStatus', { idToken: Auth.idToken, cls: c });
    if (res && res.ok) all.push(...res.rows);
  }
  dl(`음악산업탐구_전체_${fmtDT(new Date()).replace(/[: ]/g, '')}.csv`, rowsToCsv(all));
  toast(`전체 ${all.length}명분을 내려받았습니다`, 'ok');
});

$('#btnMissing').addEventListener('click', () => {
  const miss = T.rows.filter(r => r.state !== 'done')
    .map(r => `${r.sid} ${r.name}`).join('\n');
  if (!miss) { toast('미제출자가 없습니다', 'ok'); return; }
  navigator.clipboard.writeText(miss)
    .then(() => toast(`미제출 ${miss.split('\n').length}명을 복사했습니다`, 'ok'))
    .catch(() => alert(miss));
});

/* ===========================================================================
 *  4. 명렬표
 * ========================================================================= */

async function loadRoster() {
  const res = await apiPost('teacherRoster', { idToken: Auth.idToken });
  if (!res || !res.ok) { toast(errText(res), 'bad'); return; }
  T.roster = res.rows || [];
  $('#rsTable tbody').innerHTML = T.roster.map(r => `<tr>
    <td class="num">${esc(r.sid)}</td><td>${esc(r.name)}</td><td>${esc(r.cls)}</td>
    <td class="dim">${esc(r.pw)}</td>
    <td class="dim" style="font-size:.8rem">${esc(r.email) || '<span class="badge none">미연결</span>'}</td>
    <td class="num dim">${esc(r.last ? String(r.last).slice(5, 16) : '')}</td>
  </tr>`).join('') || '<tr><td colspan="6" class="dim">명렬표가 비어 있습니다.</td></tr>';
  toast(`명렬표 ${T.roster.length}명`, 'ok');
}
$('#btnRosterLoad').addEventListener('click', loadRoster);

/* ---------------------------------------------------------------------------
 *  명렬표 붙여넣기
 *
 *  두 가지 모양을 모두 알아봅니다.
 *   (가) 학번 / 이름 / 비밀번호            ← 예전 방식
 *   (나) NO / 소속명 / 학년 / 반 / 번호 / 이름 / 아이디 / 가입일시 / 사용여부
 *        ← 계정 관리 엑셀을 통째로 복사한 것. 학년·반·번호로 학번을 만듭니다.
 *
 *  (나) 로 넣으면 [연결된계정] 이 미리 채워져서,
 *  학생이 남의 학번을 눌러도 그 학번으로는 들어갈 수 없게 됩니다.
 * -------------------------------------------------------------------------*/

/** 한 줄을 읽어 { sid, name, pw, email } 로 바꿉니다. 못 읽으면 null. */
function parseRosterLine(line) {
  const p = line.split(/\t|,/).map(x => x.trim());

  /* 이메일이 들어 있는 칸을 찾습니다. */
  let email = '', eIdx = -1;
  for (let i = 0; i < p.length; i++) {
    if (p[i].indexOf('@') > 0) { email = p[i].toLowerCase(); eIdx = i; break; }
  }

  /* (가) 맨 앞이 네 자리 학번인 경우 */
  if (/^\d{4}$/.test(p[0])) {
    return { sid: p[0], name: p[1] || '', pw: p[2] || '', email: email };
  }

  /* (나) 학년·반·번호가 나란히 오는 자리를 찾습니다.
     머리글 줄(NO, 소속명, 학년 …)은 숫자가 아니어서 저절로 걸러집니다. */
  const num = p.map(x => (/^\d{1,3}$/.test(x) ? Number(x) : null));
  for (let i = 0; i + 2 < p.length; i++) {
    const g = num[i], c = num[i + 1], n = num[i + 2];
    if (g == null || c == null || n == null) continue;
    if (g < 1 || g > 6)  continue;   // 학년
    if (c < 1 || c > 20) continue;   // 반
    if (n < 1 || n > 50) continue;   // 번호
    const sid = String(g) + String(c) + String(n).padStart(2, '0');
    if (!/^\d{4}$/.test(sid)) continue;
    /* 이름은 이메일 바로 앞 칸, 없으면 번호 다음 칸 */
    let name = (eIdx > 0) ? p[eIdx - 1] : '';
    if (!name) name = p[i + 3] || '';
    return { sid: sid, name: name, pw: '', email: email };
  }
  return null;
}

$('#btnRosterSave').addEventListener('click', async () => {
  const text = $('#rosterPaste').value.trim();
  if (!text) { toast('붙여 넣은 내용이 없습니다', 'warn'); return; }

  const rows = [], bad = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const r = parseRosterLine(line);
    if (!r) { bad.push((i + 1) + '줄'); return; }
    rows.push(r);
  });

  if (!rows.length) {
    alert('읽을 수 있는 줄이 없습니다.\n\n' +
          '· 학번 / 이름 / 비밀번호  세 칸\n' +
          '· 또는 계정 엑셀 통째로 (학년·반·번호·이름·아이디 포함)\n\n' +
          '이 두 가지 모양만 알아봅니다.');
    return;
  }

  /* 학번 중복은 여기서 먼저 걸러 냅니다. */
  const seen = {}, dup = [];
  rows.forEach(r => { if (seen[r.sid]) dup.push(r.sid); seen[r.sid] = true; });
  if (dup.length) {
    toast('학번이 겹칩니다: ' + dup.slice(0, 5).join(', '), 'bad', 7000);
    return;
  }

  /* 넣기 전에 무엇이 들어가는지 보여 줍니다.
     266명을 한 번에 넣으므로 앞뒤 몇 줄이라도 눈으로 보는 편이 안전합니다. */
  const withMail = rows.filter(r => r.email).length;
  const show = r => '  ' + r.sid + '  ' + (r.name || '(이름없음)') + '  ' + (r.email || '(계정없음)');
  let sample = rows.slice(0, 3).map(show).join('\n');
  if (rows.length > 4) sample += '\n   …\n' + show(rows[rows.length - 1]);

  const ok = confirm(
    rows.length + '명을 넣습니다.\n' +
    '그중 ' + withMail + '명은 구글 계정이 함께 연결됩니다.\n' +
    (bad.length ? '읽지 못한 줄 ' + bad.length + '개는 건너뜁니다.\n' : '') +
    '\n' + sample + '\n\n' +
    (withMail ? '계정이 연결되면 그 학생은 자기 계정으로만 들어올 수 있습니다.\n' : '') +
    '계속할까요?');
  if (!ok) return;

  const btn = $('#btnRosterSave');
  btn.disabled = true; btn.textContent = '넣는 중…';

  const res = await apiPost('teacherRosterUpsert', { idToken: Auth.idToken, rows }, 60000);

  btn.disabled = false; btn.textContent = '명렬표에 넣기';

  if (res && res.ok) {
    toast('새로 ' + res.added + '명, 고침 ' + res.updated + '명 · 계정 연결 ' + withMail + '명', 'ok', 6000);
    logOp('명렬표 — 새로 ' + res.added + ' / 고침 ' + res.updated + ' / 계정연결 ' + withMail, 'ok');
    $('#rosterPaste').value = '';
    loadRoster();
  } else {
    toast(errText(res), 'bad', 8000);
    logOp('명렬표 실패 — ' + errText(res), 'bad');
  }
});

$('#btnResetBind').addEventListener('click', async () => {
  const sid = $('#resetSid').value.trim();
  if (!/^\d{4}$/.test(sid)) { toast('학번 네 자리를 적어 주세요', 'warn'); return; }
  if (!confirm(`${sid} 학번의 계정 연결을 풉니다.\n다음에 들어오는 계정으로 다시 고정됩니다.`)) return;
  const res = await apiPost('teacherResetBinding', { idToken: Auth.idToken, sid });
  if (res && res.ok) { toast(`${sid} 연결을 풀었습니다`, 'ok'); $('#resetSid').value = ''; loadRoster(); }
  else toast(errText(res), 'bad');
});

/* ===========================================================================
 *  5. 기록
 * ========================================================================= */

$('#btnLogLoad').addEventListener('click', async () => {
  const res = await apiPost('teacherLogs', { idToken: Auth.idToken });
  if (!res || !res.ok) { toast(errText(res), 'bad'); return; }
  $('#lgTable tbody').innerHTML = (res.rows || []).map(r => `<tr>
    <td class="num dim">${esc(String(r[0]).slice(5, 19))}</td>
    <td>${esc(r[1])}</td>
    <td class="dim" style="font-size:.8rem">${esc(r[2])}</td>
    <td class="num">${esc(r[3])}</td>
    <td>${r[4] === 'OK' ? '<span class="badge done">OK</span>'
                        : '<span class="badge draft">' + esc(r[4]) + '</span>'}</td>
    <td class="dim">${esc(r[5])}</td>
  </tr>`).join('') || '<tr><td colspan="6" class="dim">기록이 없습니다.</td></tr>';
  toast(`${(res.rows || []).length}줄`, 'ok');
});


/* ===========================================================================
 *  8. 학습 자료 — 학생 화면의 [산업 둘러보기] 와 같은 내용입니다.
 *     수업 중 교실 화면에 띄워 함께 보기 위한 탭입니다.
 *     학생 화면과 달리 '분야 정하기' 단추는 없습니다. (교사는 고를 일이 없으므로)
 * ========================================================================= */

/* 표지 색·그림·활동지 문항은 shared.js 에 있습니다. */

let tSearch = '';
let tLearnReady = false;

function renderLearn() {
  if (!tLearnReady) {
    $('#tSearchBox').addEventListener('input', e => {
      tSearch = e.target.value.trim().toLowerCase();
      tRenderAlbums(); tRenderJobs();
    });

    /* 안쪽 탭 이동 */
    $$('.subtab').forEach(b => b.addEventListener('click', () => {
      $$('.subtab').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      ['browse', 'sheet', 'present', 'peer'].forEach(n =>
        $('#sub-' + n).hidden = (n !== b.dataset.sub));
    }));

    tBuildSheet();
    tBuildPeer();
    tSetupTimer();
    tLearnReady = true;
  }
  tRenderAlbums();
  tRenderJobs();
}

/* ---------- 활동지 (보기 전용) ----------
   학생이 보는 아홉 문항을 그대로 보여 줍니다. 글은 쓸 수 없습니다. */
function tBuildSheet() {
  $('#tQList').innerHTML = QUESTIONS.map(q => {
    const badge = q.badge
      ? `<span class="q-badge ${q.key ? 'key' : ''}">${esc(q.badge)}${q.key ? ' · 상·중을 가름' : ''}</span>`
      : '';
    let body = '';

    if (q.type === 'pick') {
      body = `<div class="grid">${INDUSTRIES.map((ind, i) => `
        <div class="album">
          <div class="art" style="${artStyle(i)}">
            <span class="num">${ind.n}</span>
            ${artSvg(ind.n)}
          </div>
          <div class="nm">${esc(ind.name)}</div>
        </div>`).join('')}</div>`;
    } else if (q.type === 'line') {
      body = `<input class="t-input" type="text" disabled placeholder="학생이 한 문장으로 적습니다">`;
    } else if (q.type === 'three') {
      body = Q9_LABEL.map(lab => `
        <label class="field"><span>${esc(lab)}</span>
          <input class="t-input" type="text" disabled placeholder="학생이 한 문장으로 적습니다"></label>`).join('');
    } else {
      body = `<textarea class="t-input" rows="${q.rows || 3}" disabled
        placeholder="학생이 여기에 적습니다 (${q.min}자 이상 권장)"></textarea>`;
    }

    return `
      <div class="q">
        <div class="q-head">
          <span class="q-no">${q.no}</span>
          <div>
            <div class="q-title">${esc(q.title)} ${badge}</div>
            <div class="q-sub">${esc(q.sub)}</div>
          </div>
        </div>
        ${body}
        <p class="q-help">${esc(q.help)}</p>
      </div>`;
  }).join('');
}

/* ---------- 동료 평가 (보기 전용) ---------- */
function tBuildPeer() {
  $('#tPeerView').innerHTML = `
    <div class="q">
      <div class="row-wrap">
        <label class="field"><span>발표자 학번</span>
          <input class="t-input" type="text" disabled placeholder="예) 3405"></label>
        <label class="field"><span>발표한 분야</span>
          <select class="t-select" disabled><option>고르기</option></select></label>
      </div>
      <label class="field" style="margin-top:12px"><span>얼마나 이해되었나요</span>
        <select class="t-select" disabled><option>잘 이해됨 / 보통 / 어려웠음</option></select></label>
      <label class="field" style="margin-top:12px"><span>인상 깊었던 점</span>
        <textarea class="t-input" rows="2" disabled placeholder="학생이 적습니다"></textarea></label>
      <label class="field" style="margin-top:12px"><span>더 궁금한 점</span>
        <textarea class="t-input" rows="2" disabled placeholder="학생이 적습니다"></textarea></label>
    </div>`;
}

/* ---------- 1분 타이머 (교실 화면용으로 실제로 돕니다) ---------- */
function tSetupTimer() {
  let left = 60, id = null;
  const show = () => { $('#tClock').textContent = fmtLeft(left * 1000); };
  show();
  $('#tBtnTimer').addEventListener('click', () => {
    if (id) {
      clearInterval(id); id = null; $('#tBtnTimer').textContent = '시작';
      return;
    }
    $('#tBtnTimer').textContent = '멈춤';
    id = setInterval(() => {
      left--; show();
      if (left <= 0) {
        clearInterval(id); id = null;
        $('#tBtnTimer').textContent = '시작';
        toast('1분이 지났습니다', 'warn');
      }
    }, 1000);
  });
  $('#tBtnTimerReset').addEventListener('click', () => {
    clearInterval(id); id = null; left = 60; show();
    $('#tBtnTimer').textContent = '시작';
  });
}

/* ---------- 로그아웃 ---------- */
$('#btnTLogout').addEventListener('click', () => {
  if (!confirm('로그아웃하시겠습니까?\n\n다시 들어오려면 구글 로그인과 비밀번호가 필요합니다.')) return;
  Auth.signOut();
  location.reload();
});

function tMatch(ind) {
  if (!tSearch) return true;
  const hay = [ind.name, ind.en, ind.one,
    ind.jobs.map(j => j.join(' ')).join(' '),
    (ind.terms || []).map(t => t.join(' ')).join(' '),
    (ind.search || []).join(' ')].join(' ').toLowerCase();
  return hay.includes(tSearch);
}

function tRenderAlbums() {
  const list = INDUSTRIES.filter(tMatch);
  $('#tBrowseCount').textContent = `${list.length}개 분야 보임 (전체 ${INDUSTRIES.length}개)`;

  $('#tAlbumGrid').innerHTML = list.map(ind => {
    const i = INDUSTRIES.indexOf(ind);
    return `
    <button class="album" data-n="${ind.n}">
      <div class="art" style="${artStyle(i)}">
        <span class="num">${ind.n}</span>
        ${artSvg(ind.n)}
        <span class="en">${esc(ind.en)}</span>
        <span class="play" aria-hidden="true">▶</span>
      </div>
      <div class="nm">${esc(ind.name)}</div>
      <div class="ln">${esc(ind.one)}</div>
    </button>`;
  }).join('') || '<p class="dim">찾는 낱말이 들어간 분야가 없습니다.</p>';

  $$('#tAlbumGrid .album').forEach(a =>
    a.addEventListener('click', () => tOpenDetail(a.dataset.n)));
}

function tRenderJobs() {
  const rows = [];
  INDUSTRIES.forEach(ind => {
    ind.jobs.forEach(j => {
      const hay = (j.join(' ') + ' ' + ind.name).toLowerCase();
      if (tSearch && !hay.includes(tSearch)) return;
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
  $('#tJobList').innerHTML = rows.join('') || '<p class="dim">찾는 낱말이 들어간 직업이 없습니다.</p>';
  $$('#tJobList .track').forEach(t => {
    const go = () => tOpenDetail(t.dataset.n);
    t.addEventListener('click', go);
    t.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });
}

function tOpenDetail(n) {
  const i = INDUSTRIES.findIndex(x => x.n === n);
  if (i < 0) return;
  const d = INDUSTRIES[i];
  const majors = (typeof MAJORS !== 'undefined' && MAJORS[n]) ? MAJORS[n] : null;

  $('#tDetail').innerHTML = `
    <div class="banner" style="${artStyle(i)}">
      <button class="back" id="tBtnBack" aria-label="닫기">✕</button>
      <div class="banner-art">${artSvg(d.n)}</div>
      <div class="kicker">분야 ${d.n} · ${esc(d.en)}</div>
      <h2>${esc(d.name)}</h2>
      <p class="one">${esc(d.one)}</p>
    </div>

    <div class="detail-body">
      <div class="detail-actions">
        <button class="btn ghost" id="tBtnClose2">닫기</button>
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
        <div class="taglist">${d.search.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div></div>

      <div class="sec"><h3>생각해 볼 질문</h3>
        <ul class="think">${d.think.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        <p class="dim" style="margin-top:8px">학생에게 던질 발문으로 쓰기 좋습니다.</p></div>
    </div>`;

  $('#tDetail').hidden = false;
  $('#tDetail').scrollTop = 0;
  document.body.style.overflow = 'hidden';

  $('#tBtnBack').addEventListener('click', tCloseDetail);
  $('#tBtnClose2').addEventListener('click', tCloseDetail);
}

function tCloseDetail() {
  $('#tDetail').hidden = true;
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#tDetail').hidden) tCloseDetail();
});
