/* ============================================================================
 *  common.js — 학생 화면과 교사 화면이 함께 쓰는 도구 모음
 *  버전: common v1.1.0 (2026-08-17)
 * ==========================================================================*/

const COMMON_VERSION = 'common v1.2.0 (2026-08-18) 계정연결';

/* ---------------------------------------------------------------------------
 *  1. 짧은 도우미
 * -------------------------------------------------------------------------*/

/** 요소 하나 찾기 */
const $ = (sel, root) => (root || document).querySelector(sel);
/** 요소 여러 개 찾기 (배열로 돌려줌) */
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/** HTML 특수문자를 안전하게 바꿉니다. 학생이 <>를 써도 화면이 깨지지 않습니다. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 두 자리 숫자로 (9 → 09) */
const pad2 = n => String(n).padStart(2, '0');

/** 날짜를 'YYYY-MM-DD HH:mm' 로 */
function fmtDT(d) {
  if (!d) return '';
  const x = (d instanceof Date) ? d : new Date(d);
  if (isNaN(x)) return String(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())} ` +
         `${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
}

/** 'HH:mm:ss' 남은 시간 표시 */
function fmtLeft(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${pad2(m)}:${pad2(s % 60)}`;
}

/** 학번(4자리)에서 반 이름을 뽑습니다. 3301 → '3-3' */
function classOf(sid) {
  const s = String(sid || '').trim();
  if (!/^\d{4}$/.test(s)) return '';
  return `${s[0]}-${s[1]}`;
}

/** 문자열을 짧은 지문(내용이 바뀌었는지 비교용)으로 만듭니다. */
function fingerprint(str) {
  let h = 5381;
  const s = String(str);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
}

/* ---------------------------------------------------------------------------
 *  2. 화면 아래 알림 (토스트)
 * -------------------------------------------------------------------------*/

let _toastTimer = null;
/** kind: 'ok' | 'warn' | 'bad' | '' */
function toast(msg, kind, ms) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast show ' + (kind || '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast ' + (kind || ''); }, ms || 2600);
}

/* ---------------------------------------------------------------------------
 *  3. 브라우저 저장소 (localStorage)
 *     학생이 새로고침해도 쓰던 내용이 남아 있게 합니다.
 * -------------------------------------------------------------------------*/

const LS = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('저장 실패', e); return false; }
  },
  del(key) { try { localStorage.removeItem(key); } catch (e) {} }
};

/* ---------------------------------------------------------------------------
 *  4. 서버 통신
 *
 *  · 읽기 전용(제출 열림 여부 확인)은 JSONP 로 부릅니다.
 *    → 학교망에서 CORS 문제가 나지 않고, 서버 부담도 작습니다.
 *  · 나머지(로그인 확인·저장·제출)는 POST 로 부릅니다.
 *    → Content-Type 을 text/plain 으로 보내야 사전 요청(preflight)이 생기지 않습니다.
 * -------------------------------------------------------------------------*/

/** JSONP 호출. 읽기 전용 동작에만 씁니다. */
function apiGet(params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const cbName = '__cb' + Date.now() + Math.floor(Math.random() * 1000);
    const qs = new URLSearchParams(Object.assign({}, params, { callback: cbName }));
    const s = document.createElement('script');
    let done = false;

    const cleanup = () => {
      done = true;
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      if (!done) { cleanup(); reject(new Error('서버 응답이 없습니다 (시간 초과)')); }
    }, timeoutMs || 12000);

    window[cbName] = (data) => { cleanup(); resolve(data); };
    s.onerror = () => { if (!done) { cleanup(); reject(new Error('서버에 연결하지 못했습니다')); } };
    s.src = SERVER_URL + '?' + qs.toString();
    document.head.appendChild(s);
  });
}

/** POST 호출. 로그인 확인·저장·제출·교사 기능에 씁니다. */
async function apiPost(action, payload, timeoutMs) {
  const body = JSON.stringify(Object.assign({ action }, payload || {}));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 20000);
  try {
    const res = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      signal: ctrl.signal,
      redirect: 'follow'
    });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch (e) { return { ok: false, error: 'BAD_RESPONSE', message: text.slice(0, 300) }; }
  } catch (e) {
    return { ok: false, error: 'NETWORK', message: e.name === 'AbortError' ? '시간 초과' : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

/** 탭을 닫을 때 마지막으로 한 번 더 보냅니다. (응답은 기다리지 않음) */
function apiBeacon(action, payload) {
  try {
    const body = JSON.stringify(Object.assign({ action }, payload || {}));
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    return navigator.sendBeacon(SERVER_URL, blob);
  } catch (e) { return false; }
}

/* ---------------------------------------------------------------------------
 *  5. 구글 로그인 (Google Identity Services)
 * -------------------------------------------------------------------------*/

const Auth = {
  idToken: null,
  email: '',
  name: '',
  expAt: 0,
  _onLogin: null,

  /** 로그인 단추를 그립니다. onLogin(payload) 는 로그인 성공 시 호출됩니다. */
  render(buttonEl, onLogin) {
    this._onLogin = onLogin;
    const start = () => {
      if (!window.google || !google.accounts || !google.accounts.id) {
        buttonEl.innerHTML = '<p class="err">구글 로그인 모듈을 불러오지 못했습니다. ' +
          '인터넷 연결과 방화벽을 확인해 주세요.</p>';
        return;
      }
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => Auth._handle(resp),
        auto_select: false,
        cancel_on_tap_outside: true,
        hd: ALLOWED_DOMAIN            // 학교 계정만 보이도록 힌트를 줍니다
      });
      google.accounts.id.renderButton(buttonEl, {
        theme: 'filled_black', size: 'large', shape: 'pill',
        text: 'signin_with', locale: 'ko', width: 280
      });
    };
    /* 구글 스크립트가 준비될 때까지 0.2초 간격으로 최대 10초 기다립니다.
       'gsi-ready' 이벤트만 기다리면 스크립트가 먼저 도착했을 때 놓치는 일이
       있어서, 직접 확인하는 방식으로 두었습니다. */
    let tries = 0;
    const wait = setInterval(function () {
      if (window.google && google.accounts && google.accounts.id) {
        clearInterval(wait); start();
      } else if (++tries > 50) {
        clearInterval(wait); start();   // 10초가 지나면 안내 문구를 띄웁니다
      }
    }, 200);
  },

  _handle(resp) {
    if (!resp || !resp.credential) { toast('로그인에 실패했습니다', 'bad'); return; }
    this.idToken = resp.credential;
    const p = this.parse(resp.credential) || {};
    this.email = (p.email || '').toLowerCase();
    this.name = p.name || '';
    this.expAt = (p.exp || 0) * 1000;
    if (!this.email.endsWith('@' + ALLOWED_DOMAIN)) {
      toast(`@${ALLOWED_DOMAIN} 학교 계정으로 로그인해 주세요`, 'bad', 5000);
      this.signOut();
      return;
    }
    if (this._onLogin) this._onLogin(p);
  },

  /** ID 토큰 안을 들여다봅니다. (확인은 서버에서 다시 합니다) */
  parse(token) {
    try {
      const b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(atob(b).split('').map(
        c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(json);
    } catch (e) { return null; }
  },

  /** 토큰이 아직 살아 있는지 (만료 2분 전이면 만료로 봅니다) */
  alive() { return !!this.idToken && Date.now() < this.expAt - 120000; },

  signOut() {
    this.idToken = null; this.email = ''; this.name = ''; this.expAt = 0;
    try { google.accounts.id.disableAutoSelect(); } catch (e) {}
  }
};

/* 구글 스크립트가 늦게 도착해도 되도록 신호를 보냅니다. */
window.onGsiLoad = function () { window.dispatchEvent(new Event('gsi-ready')); };

/* ---------------------------------------------------------------------------
 *  6. 서버가 돌려주는 오류 코드를 사람 말로 바꿉니다.
 * -------------------------------------------------------------------------*/

const ERR_TEXT = {
  NO_TOKEN:          '로그인 정보가 없습니다. 다시 로그인해 주세요.',
  BAD_TOKEN:         '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  WRONG_AUDIENCE:    '클라이언트 ID 설정이 맞지 않습니다. 선생님께 알려 주세요.',
  DOMAIN_DENIED:     '학교 계정(@' + (typeof ALLOWED_DOMAIN !== 'undefined' ? ALLOWED_DOMAIN : '') + ')으로만 들어올 수 있습니다.',
  NOT_IN_ROSTER:     '명렬표에 없는 학번입니다. 학번을 다시 확인해 주세요.',
  NOT_LINKED:        '이 계정이 명렬표에 없습니다. 학번을 직접 넣어 주세요.',
  NAME_MISMATCH:     '학번과 이름이 맞지 않습니다.',
  WRONG_PASSWORD:    '비밀번호가 맞지 않습니다.',
  LOCKED:            '비밀번호를 여러 번 틀렸습니다. 잠시 뒤에 다시 해 주세요.',
  ACCOUNT_MISMATCH:  '이 학번은 다른 학생의 것입니다. 학번을 다시 확인해 주세요.',
  DUPLICATE_ACCOUNT: '이 계정은 다른 학번으로 이미 들어왔습니다. 선생님께 말씀해 주세요.',
  NOT_TEACHER:       '교사 계정이 아닙니다.',
  WRONG_TEACHER_PW:  '수업자용 비밀번호가 맞지 않습니다.',
  ENTRY_CLOSED:      '아직 수업이 열리지 않았습니다. 선생님이 열어 주실 때까지 기다려 주세요.',
  ENTRY_BEFORE:      '입장 시간이 아직 되지 않았습니다.',
  ENTRY_AFTER:       '수업 시간이 끝났습니다. 다음 시간에 이어서 하세요.',
  CLOSED:            '지금은 제출 시간이 아닙니다.',
  BEFORE_OPEN:       '아직 제출이 열리지 않았습니다.',
  AFTER_CLOSE:       '제출이 마감되었습니다.',
  ALREADY_SUBMITTED: '이미 제출했습니다. 다시 내려면 선생님이 열어 주셔야 합니다.',
  NO_SHEET:          '스프레드시트 준비가 끝나지 않았습니다. 선생님께 알려 주세요.',
  NETWORK:           '인터넷 연결이 불안정합니다. 쓰던 내용은 기기에 남아 있습니다.',
  BAD_RESPONSE:      '서버 응답을 읽지 못했습니다. 선생님께 알려 주세요.'
};
function errText(res) {
  if (!res) return '알 수 없는 오류입니다.';
  return ERR_TEXT[res.error] || res.message || res.error || '알 수 없는 오류입니다.';
}
