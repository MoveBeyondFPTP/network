import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, setDoc, getDoc, onSnapshot, writeBatch, waitForPendingWrites,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { parseCard } from './parser.js';

// ── Setup ───────────────────────────────────────────────────────────────

const cfg = (window.CRM_CONFIG && window.CRM_CONFIG.firebase) || {};
const configured = Boolean(cfg.apiKey && cfg.projectId && !/PASTE|YOUR/i.test(cfg.apiKey + cfg.projectId));

let auth = null;
let db = null;
if (configured) {
  const app = initializeApp(cfg);
  auth = getAuth(app);
  try {
    // Keeps a full copy of your data on the device and queues edits while offline.
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    console.warn('On-device cache unavailable, using memory cache', e);
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  }
}

const COLORS = {
  sage:     { bg: '#DCEBE2', fg: '#1F4D3E', dot: '#2F6B57', label: 'Sage' },
  blush:    { bg: '#FBE3DC', fg: '#9A3E25', dot: '#E07A5F', label: 'Blush' },
  sky:      { bg: '#E1E9F5', fg: '#2E4E7E', dot: '#6C8EBF', label: 'Sky' },
  lavender: { bg: '#E3E2F7', fg: '#3A3AA8', dot: '#7B7BE0', label: 'Lavender' },
  sand:     { bg: '#F4EBD6', fg: '#6F5313', dot: '#C9A24A', label: 'Sand' },
  rose:     { bg: '#F7E0EA', fg: '#8A2D57', dot: '#D4709A', label: 'Rose' },
  slate:    { bg: '#E6E9EC', fg: '#3D4A56', dot: '#7A8794', label: 'Slate' },
};

const CONTACT_FIELDS = ['first_name', 'last_name', 'title', 'company', 'email', 'phone', 'website', 'address'];

const S = {
  user: null,
  contacts: [], tags: [], notes: [],
  loaded: false,
  view: 'list',          // list | contact | new | scan | tags
  currentId: null,
  draft: null,
  filter: 'all',
  search: '',
  sort: 'recent',
  writeError: null,
  authMode: 'signin',    // signin | signup | reset
  authMsg: '', authErr: false,
  scan: null,
};

// ── Small helpers ───────────────────────────────────────────────────────

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
const nowIso = () => new Date().toISOString();
const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;

const ICON = {
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  people: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M17 11a3 3 0 100-6M22 21c0-3-2-5-4-5.5"/></svg>',
  scan: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2"/><rect x="7" y="9" width="10" height="6" rx="1"/></svg>',
  tag: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4a1 1 0 011-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/></svg>',
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  plusSm: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  camera: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="12" cy="13" r="4"/></svg>',
  image: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
  phone: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/></svg>',
  mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  globe: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>',
  chat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/></svg>',
  trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  card: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.5 1.7-2 3-2s2.4.5 3 2M15 10h3M15 13h3"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  sort: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/></svg>',
};

function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  if (s < 86400 * 60) return `${Math.floor(s / 86400 / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function fullName(c) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.company || c.email || 'Unnamed contact';
}
function initials(c) {
  const a = (c.first_name || '').trim()[0] || '';
  const b = (c.last_name || '').trim()[0] || '';
  return (a + b || (c.company || c.email || '?').trim()[0] || '?').toUpperCase();
}
function subtitle(c) { return [c.title, c.company].filter(Boolean).join(' · '); }
const tagById = (id) => S.tags.find((t) => t.id === id);
const pal = (color) => COLORS[color] || COLORS.sage;
const chipStyle = (color) => `background:${pal(color).bg};color:${pal(color).fg}`;
function contactColor(c) {
  const t = (c.tags || []).map(tagById).find(Boolean);
  return t ? t.color : 'sage';
}
const notesFor = (id) => S.notes.filter((n) => n.contact_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
const getContact = (id) => S.contacts.find((c) => c.id === id);
function normUrl(u) { return /^https?:\/\//i.test(u) ? u : `https://${u}`; }

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Data: Firestore paths, live listeners, writes ───────────────────────
// Your data lives at users/{your id}/contacts, /tags, /notes and /cards.

const col = (name) => collection(db, 'users', S.user.uid, name);
const ref = (name, id) => doc(db, 'users', S.user.uid, name, id);

const pendingWrites = { contacts: false, tags: false, notes: false };
let unsubs = [];

function listen() {
  const loaded = { contacts: false, tags: false, notes: false };
  ['contacts', 'tags', 'notes'].forEach((name) => {
    const un = onSnapshot(col(name), { includeMetadataChanges: true }, (snap) => {
      let rows = snap.docs.map((d) => d.data());
      if (name === 'contacts') rows = rows.map((r) => (pendingEdits.has(r.id) ? { ...r, ...pendingEdits.get(r.id) } : r));
      if (name === 'tags') rows.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      S[name] = rows;
      pendingWrites[name] = snap.metadata.hasPendingWrites;
      loaded[name] = true;
      S.loaded = loaded.contacts && loaded.tags && loaded.notes;
      refresh();
      updateSync();
    }, (err) => {
      console.error('Listen error', err);
      S.writeError = err.code || err.message;
      updateSync();
      if (err.code === 'permission-denied') toast("Your account doesn't have access. Check the security rules in Firebase.");
    });
    unsubs.push(un);
  });
}

// Every save goes through here. Offline saves wait on the device and send later.
function commit(promise) {
  updateSync();
  promise
    .then(() => { if (S.writeError) S.writeError = null; updateSync(); })
    .catch((err) => {
      console.error('Save error', err);
      S.writeError = err.code || err.message;
      updateSync();
      toast(err.code === 'permission-denied' ? "Couldn't save: access denied. Check your Firebase rules." : "A change couldn't be saved. Try again.");
    });
}

function contactDoc(c) {
  const r = { id: c.id, tags: c.tags || [], has_card: Boolean(c.has_card), created_at: c.created_at, updated_at: c.updated_at };
  CONTACT_FIELDS.forEach((f) => { r[f] = c[f] || ''; });
  return r;
}

// ── Sync indicator ──────────────────────────────────────────────────────

function syncState() {
  const pending = pendingEdits.size > 0 || Object.values(pendingWrites).some(Boolean);
  if (S.writeError) return { state: 'error', label: 'Sync issue · tap to retry' };
  if (!navigator.onLine) return { state: 'offline', label: pending ? 'Offline · saved on device' : 'Offline' };
  if (pending) return { state: 'saving', label: 'Saving…' };
  return { state: 'synced', label: 'Synced' };
}
function updateSync() {
  const { state, label } = syncState();
  document.querySelectorAll('[data-sync]').forEach((el) => {
    el.dataset.state = state;
    const t = el.querySelector('.sync-text');
    if (t) t.textContent = label;
  });
}
function syncPill(aria = 'Sync status') {
  const { state, label } = syncState();
  return `<button class="sync-pill" data-sync data-state="${state}" data-act="sync" aria-label="${aria}"><span class="dot" aria-hidden="true"></span><span class="sync-text">${label}</span></button>`;
}

// ── Autosave for contact edits ──────────────────────────────────────────

const pendingEdits = new Map(); // contactId -> changed fields not yet sent
const saveTimers = new Map();

function scheduleSave(id) {
  clearTimeout(saveTimers.get(id));
  saveTimers.set(id, setTimeout(() => commitSave(id), 600));
  updateSync();
}
function commitSave(id) {
  clearTimeout(saveTimers.get(id));
  saveTimers.delete(id);
  const edits = pendingEdits.get(id);
  if (!edits || !S.user) return;
  pendingEdits.delete(id);
  commit(setDoc(ref('contacts', id), edits, { merge: true }));
}
function commitAllSaves() {
  [...pendingEdits.keys()].forEach(commitSave);
}

// ── Auth ────────────────────────────────────────────────────────────────

let started = false;
function init() {
  if (!configured) { renderSetup(); return; }
  onAuthStateChanged(auth, (user) => {
    if (user) { if (!S.user || S.user.uid !== user.uid) start(user); }
    else { if (S.user) stop(); renderAuth(); }
  });
}

function start(user) {
  if (S.user) stop();
  S.user = user;
  S.loaded = false;
  renderShell();
  listen();
  if (!started) {
    started = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') commitAllSaves(); });
    window.addEventListener('pagehide', commitAllSaves);
    window.addEventListener('online', updateSync);
    window.addEventListener('offline', updateSync);
    window.addEventListener('popstate', () => {
      if (!history.state?.d && S.view !== 'list') { commitAllSaves(); S.view = 'list'; S.scan = null; renderLayout(); }
    });
    setInterval(() => { if (S.user && document.visibilityState === 'visible') renderCards(); }, 60000);
  }
}

function stop() {
  unsubs.forEach((u) => u());
  unsubs = [];
  S.user = null;
  S.contacts = []; S.tags = []; S.notes = [];
  S.view = 'list'; S.currentId = null; S.draft = null; S.filter = 'all'; S.search = '';
  S.writeError = null;
  pendingEdits.clear();
  S.authMode = 'signin';
}

function renderSetup() {
  $('#app').innerHTML = `
    <main class="auth">
      <div class="auth-card">
        <div class="brand-mark" aria-hidden="true">${ICON.card}</div>
        <h1>Almost there</h1>
        <p class="muted">This copy of the app isn't connected to your database yet. Open <strong>config.js</strong>, paste in your Firebase settings, and upload it again. The README walks through it step by step.</p>
      </div>
    </main>`;
}

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/invalid-email': "That email address doesn't look right.",
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/missing-password': 'Enter your password.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': "You're offline. Connect to the internet to sign in.",
  'auth/operation-not-allowed': 'Email sign-in is not turned on yet. See step 1 of the README.',
  'auth/admin-restricted-operation': 'New sign-ups are turned off for this app.',
  'auth/user-disabled': 'This account has been turned off.',
};

function renderAuth() {
  const m = S.authMode;
  const heading = { signin: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[m];
  const sub = {
    signin: 'Sign in to see your contacts on any device.',
    signup: 'Your contacts are stored in your account, so they follow you to every device.',
    reset: "We'll email you a link to set a new password.",
  }[m];
  $('#app').innerHTML = `
    <main class="auth">
      <form class="auth-card" id="auth-form" novalidate>
        <div class="brand-mark" aria-hidden="true">${ICON.card}</div>
        <h1>${heading}</h1>
        <p class="muted">${sub}</p>
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" autocapitalize="off" required></label>
        ${m !== 'reset' ? `<label class="field"><span>Password</span><input name="password" type="password" autocomplete="${m === 'signin' ? 'current-password' : 'new-password'}" minlength="6" required></label>` : ''}
        ${S.authMsg ? `<p class="auth-msg ${S.authErr ? 'err' : ''}" role="status">${esc(S.authMsg)}</p>` : ''}
        <button class="btn primary wide" type="submit">${{ signin: 'Sign in', signup: 'Create account', reset: 'Send reset link' }[m]}</button>
        <div class="auth-links">
          ${m === 'signin' ? `<button type="button" class="link" data-auth="signup">Create an account</button><button type="button" class="link" data-auth="reset">Forgot password?</button>` : `<button type="button" class="link" data-auth="signin">Back to sign in</button>`}
        </div>
      </form>
    </main>`;
  $('#auth-form').addEventListener('submit', onAuthSubmit);
  document.querySelectorAll('[data-auth]').forEach((b) => b.addEventListener('click', () => { S.authMode = b.dataset.auth; S.authMsg = ''; renderAuth(); }));
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  S.authErr = false;
  S.authMsg = '';
  try {
    if (S.authMode === 'signin') { await signInWithEmailAndPassword(auth, email, password); return; }
    if (S.authMode === 'signup') { await createUserWithEmailAndPassword(auth, email, password); return; }
    await sendPasswordResetEmail(auth, email);
    S.authMode = 'signin';
    S.authMsg = 'Reset link sent. Check your email, set a new password, then sign in here.';
  } catch (err) {
    S.authErr = true;
    S.authMsg = AUTH_ERRORS[err.code] || err.message || 'Something went wrong.';
  }
  renderAuth();
}

// ── Main layout ─────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
function userInitials() {
  const e = S.user?.email || '';
  const local = e.split('@')[0].replace(/[^a-z]/gi, ' ').trim().split(/\s+/);
  return ((local[0]?.[0] || '') + (local[1]?.[0] || '')).toUpperCase() || 'ME';
}

let shellEventsBound = false;
function renderShell() {
  $('#app').innerHTML = `
    <div class="shell" id="shell">
      <section class="list-pane" aria-label="Contacts">
        <header class="band">
          <div class="band-top">
            <div class="band-title">
              <span class="hello">${greeting()}</span>
              <h1>Contacts</h1>
            </div>
            <div class="band-actions">
              <button class="round glass" data-act="new" aria-label="Add contact manually">${ICON.plus}</button>
              <button class="round glass avatar" data-act="settings" aria-label="Account and sync">${esc(userInitials())}</button>
            </div>
          </div>
          <label class="search">
            ${ICON.search}
            <span class="sr-only">Search contacts</span>
            <input id="search" type="search" placeholder="Search people, companies, notes" autocomplete="off" value="${esc(S.search)}">
          </label>
          <div class="chips" id="chips" role="toolbar" aria-label="Filter by portfolio"></div>
        </header>
        <div class="list-meta">
          <button class="meta-btn" data-act="sort" id="sort-btn"></button>
          ${syncPill()}
        </div>
        <div class="cards" id="cards"></div>
        <nav class="tabbar" aria-label="Main">
          <button class="tab" data-act="go-list" aria-label="Contacts">${ICON.people}</button>
          <button class="scan-fab" data-act="go-scan" aria-label="Scan business card">${ICON.scan}</button>
          <button class="tab" data-act="go-tags" aria-label="Portfolios and tags">${ICON.tag}</button>
        </nav>
      </section>
      <section class="detail-pane" id="detail" aria-live="polite"></section>
    </div>
    <div id="sheet-root"></div>
    <div id="toast" class="toast" role="status"></div>`;

  $('#search').addEventListener('input', (e) => { S.search = e.target.value; renderCards(); });
  $('#detail').addEventListener('input', onDetailInput);
  $('#detail').addEventListener('change', onDetailChange);
  if (!shellEventsBound) { shellEventsBound = true; $('#app').addEventListener('click', onClick); }
  renderLayout();
}

function renderLayout() {
  const shell = $('#shell');
  if (!shell) return;
  shell.classList.toggle('show-detail', S.view !== 'list');
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  $(S.view === 'tags' ? '[data-act="go-tags"]' : '[data-act="go-list"]')?.classList.add('active');
  renderChips();
  renderCards();
  renderDetail();
}

function refresh() {
  if (!$('#shell')) return;
  renderChips();
  renderCards();
  const active = document.activeElement;
  const editing = active && $('#detail')?.contains(active) && /INPUT|TEXTAREA/.test(active.tagName);
  if (!editing && S.view !== 'scan' && S.view !== 'new' && !$('#sheet-root')?.innerHTML) renderDetail();
}

function openView(view, id = null) {
  if (S.view === 'list' && view !== 'list' && !isDesktop()) history.pushState({ d: 1 }, '');
  S.view = view;
  S.currentId = id;
  renderLayout();
  $('#detail')?.scrollTo(0, 0);
}
function closeDetail() {
  commitAllSaves();
  S.scan = null;
  if (history.state?.d) history.back();
  else { S.view = 'list'; renderLayout(); }
}

// ── List ────────────────────────────────────────────────────────────────

function renderChips() {
  const el = $('#chips');
  if (!el) return;
  if (S.filter !== 'all' && S.loaded && !tagById(S.filter)) S.filter = 'all';
  const count = (id) => S.contacts.filter((c) => (c.tags || []).includes(id)).length;
  el.innerHTML = `
    <button class="chip ${S.filter === 'all' ? 'on' : ''}" data-filter="all" aria-pressed="${S.filter === 'all'}">All · ${S.contacts.length}</button>
    ${S.tags.map((t) => `<button class="chip ${S.filter === t.id ? 'on' : ''}" data-filter="${t.id}" aria-pressed="${S.filter === t.id}"><span class="chip-dot" style="background:${pal(t.color).dot}" aria-hidden="true"></span>${esc(t.name)} · ${count(t.id)}</button>`).join('')}
    ${S.tags.length || !S.loaded ? '' : `<button class="chip" data-act="go-tags">${ICON.plusSm} Add a portfolio</button>`}`;
}

function filteredContacts() {
  const q = S.search.trim().toLowerCase();
  let list = S.contacts;
  if (S.filter !== 'all') list = list.filter((c) => (c.tags || []).includes(S.filter));
  if (q) {
    list = list.filter((c) => {
      const tagNames = (c.tags || []).map((id) => tagById(id)?.name || '').join(' ');
      const noteText = notesFor(c.id).map((n) => n.body).join(' ');
      return [fullName(c), c.title, c.company, c.email, c.phone, c.website, c.address, tagNames, noteText].join(' ').toLowerCase().includes(q);
    });
  }
  list = [...list];
  if (S.sort === 'az') list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
  else list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return list;
}

function renderCards() {
  const el = $('#cards');
  if (!el) return;
  const sortBtn = $('#sort-btn');
  if (sortBtn) sortBtn.innerHTML = `${ICON.sort}<span>${S.sort === 'az' ? 'A–Z' : 'Recent'}</span>`;
  if (!S.loaded && !S.contacts.length) { el.innerHTML = '<div class="empty small"><p>Loading your contacts…</p></div>'; return; }
  const list = filteredContacts();
  if (!S.contacts.length) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-mark" aria-hidden="true">${ICON.card}</div>
        <h2>No contacts yet</h2>
        <p>Scan a business card to add your first one, or add someone by hand.</p>
        <div class="empty-actions">
          <button class="btn primary" data-act="go-scan">${ICON.camera}Scan a card</button>
          <button class="btn ghost" data-act="new">Add manually</button>
        </div>
      </div>`;
    return;
  }
  if (!list.length) {
    el.innerHTML = `<div class="empty small"><p>No one matches${S.search ? ` “${esc(S.search)}”` : ' this filter'}.</p></div>`;
    return;
  }
  el.innerHTML = list.map((c) => {
    const tags = (c.tags || []).map(tagById).filter(Boolean);
    const lastNote = notesFor(c.id)[0];
    const extra = tags.length
      ? `<span class="tag-row">${tags.slice(0, 3).map((t) => `<span class="tag" style="${chipStyle(t.color)}">${esc(t.name)}</span>`).join('')}${tags.length > 3 ? `<span class="tag" style="${chipStyle('slate')}">+${tags.length - 3}</span>` : ''}</span>`
      : lastNote ? `<span class="snippet">${esc(lastNote.body)}</span>` : '';
    const active = isDesktop() && S.view === 'contact' && S.currentId === c.id;
    return `
      <button class="card ${active ? 'active' : ''}" data-open="${c.id}">
        <span class="av" style="${chipStyle(contactColor(c))}" aria-hidden="true">${esc(initials(c))}</span>
        <span class="card-body">
          <span class="row1"><span class="name">${esc(fullName(c))}</span><span class="when">${ago(c.updated_at)}</span></span>
          ${subtitle(c) ? `<span class="sub">${esc(subtitle(c))}</span>` : ''}
          ${extra}
        </span>
      </button>`;
  }).join('');
}

// ── Detail pane ─────────────────────────────────────────────────────────

function renderDetail() {
  const el = $('#detail');
  if (!el) return;
  if (S.view === 'contact') {
    const c = getContact(S.currentId);
    if (!c) {
      if (!S.loaded) return;
      S.view = 'list';
      el.innerHTML = emptyDetail();
      $('#shell')?.classList.remove('show-detail');
      return;
    }
    el.innerHTML = contactView(c, false);
    loadCardImage(c);
  } else if (S.view === 'new') el.innerHTML = contactView(S.draft, true);
  else if (S.view === 'scan') el.innerHTML = scanView();
  else if (S.view === 'tags') el.innerHTML = tagsView();
  else el.innerHTML = emptyDetail();
}

function emptyDetail() {
  return `<div class="detail-empty"><div class="empty-mark" aria-hidden="true">${ICON.people}</div><p>Select a contact, or scan a card to add someone new.</p></div>`;
}

function topBar(title, right = '') {
  return `
    <div class="detail-top">
      <button class="round soft back-btn" data-act="close" aria-label="Back">${ICON.back}</button>
      <span class="detail-top-title">${title}</span>
      <div class="detail-top-right">${right}</div>
    </div>`;
}

function field(name, label, value, opts = {}) {
  const { type = 'text', area = false, auto = 'off', wide = false } = opts;
  const input = area
    ? `<textarea name="${name}" rows="2" autocomplete="${auto}">${esc(value)}</textarea>`
    : `<input name="${name}" type="${type}" value="${esc(value)}" autocomplete="${auto}" ${type === 'email' || type === 'url' ? 'autocapitalize="off"' : ''}>`;
  return `<label class="field ${wide ? 'wide' : ''}"><span>${label}</span>${input}</label>`;
}

function contactView(c, isNew) {
  const right = isNew ? `<button class="btn primary sm" data-act="save-new">Save</button>` : syncPill('Save status');
  const notes = isNew ? [] : notesFor(c.id);
  const actions = [
    c.phone && `<a class="qa" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${ICON.phone}<span>Call</span></a>`,
    c.phone && `<a class="qa" href="sms:${esc(c.phone.replace(/[^\d+]/g, ''))}">${ICON.chat}<span>Text</span></a>`,
    c.email && `<a class="qa" href="mailto:${esc(c.email)}">${ICON.mail}<span>Email</span></a>`,
    c.website && `<a class="qa" href="${esc(normUrl(c.website))}" target="_blank" rel="noopener">${ICON.globe}<span>Website</span></a>`,
  ].filter(Boolean).join('');

  return `
    <div class="detail">
      ${topBar(isNew ? 'New contact' : '', right)}
      <div class="hero">
        <span class="av lg" style="${chipStyle(contactColor(c))}" aria-hidden="true" id="hero-av">${esc(initials(c))}</span>
        <div class="hero-text">
          <h2 id="hero-name">${esc(isNew && !CONTACT_FIELDS.some((f) => c[f]) ? 'New contact' : fullName(c))}</h2>
          <p class="muted" id="hero-sub">${esc(subtitle(c))}</p>
        </div>
      </div>
      ${!isNew && actions ? `<div class="quick">${actions}</div>` : ''}
      ${isNew && c._fromScan ? `<p class="note-banner">${ICON.check} We filled in what we could read. Check each field before saving.</p>` : ''}

      <form class="fields" id="contact-form" autocomplete="off" onsubmit="return false">
        ${field('first_name', 'First name', c.first_name, { auto: 'given-name' })}
        ${field('last_name', 'Last name', c.last_name, { auto: 'family-name' })}
        ${field('title', 'Title', c.title, { auto: 'organization-title' })}
        ${field('company', 'Company', c.company, { auto: 'organization' })}
        ${field('email', 'Email', c.email, { type: 'email', wide: true })}
        ${field('phone', 'Phone', c.phone, { type: 'tel' })}
        ${field('website', 'Website', c.website, { type: 'url' })}
        ${field('address', 'Address', c.address, { area: true, wide: true })}
      </form>

      <section class="block">
        <div class="block-head"><h3>Good connection for</h3><button class="link" data-act="new-tag">+ New portfolio</button></div>
        <div class="tag-picker">
          ${S.tags.length ? S.tags.map((t) => {
            const on = (c.tags || []).includes(t.id);
            return `<button class="pick ${on ? 'on' : ''}" data-toggle-tag="${t.id}" aria-pressed="${on}" style="${on ? `${chipStyle(t.color)};border-color:${pal(t.color).dot}` : ''}">${on ? ICON.check : ''}${esc(t.name)}</button>`;
          }).join('') : `<p class="muted small">Create portfolios like “Real estate” or “Consulting”, then tag people with the ones they're a good fit for.</p>`}
        </div>
      </section>

      <section class="block">
        <div class="block-head"><h3>Notes</h3></div>
        <div class="note-new">
          <label class="sr-only" for="note-input">${isNew ? 'First note' : 'New note'}</label>
          <textarea id="note-input" name="${isNew ? 'first_note' : 'note_input'}" rows="3" placeholder="${isNew ? 'Where you met, what you talked about…' : 'Add a note…'}">${isNew ? esc(c._firstNote || '') : ''}</textarea>
          ${isNew ? '' : `<button class="btn primary sm" data-act="add-note">Add note</button>`}
        </div>
        ${notes.length ? `<ul class="notes">${notes.map((n) => `
          <li class="note">
            <div class="note-meta"><span>${fmtDate(n.created_at)}</span><button class="icon-btn" data-del-note="${n.id}" aria-label="Delete note">${ICON.trash}</button></div>
            <p>${esc(n.body)}</p>
          </li>`).join('')}</ul>` : ''}
      </section>

      ${(isNew && c._card) || c.has_card ? `
      <section class="block">
        <div class="block-head"><h3>Business card</h3></div>
        <img class="card-photo" id="card-photo" alt="Photo of the business card" ${isNew ? `src="${c._card}"` : ''}>
      </section>` : ''}

      ${isNew && c._raw ? `
      <details class="raw"><summary>Text we read from the card</summary><pre>${esc(c._raw)}</pre></details>` : ''}

      ${isNew ? `<button class="btn primary wide" data-act="save-new">Save contact</button>` : `
      <div class="detail-foot">
        <p class="muted small">Added ${fmtDate(c.created_at)} · Updated ${ago(c.updated_at)}</p>
        <div class="foot-actions">
          <button class="btn ghost sm" data-act="vcard">${ICON.card}Save to phone contacts</button>
          <button class="btn danger sm" data-act="delete">${ICON.trash}Delete</button>
        </div>
      </div>`}
    </div>`;
}

const cardCache = {};
async function loadCardImage(c) {
  if (!c.has_card) return;
  const img = $('#card-photo');
  if (!img) return;
  if (cardCache[c.id]) { img.src = cardCache[c.id]; return; }
  try {
    const snap = await getDoc(ref('cards', c.id));
    const data = snap.exists() ? snap.data().data : null;
    if (!data) throw new Error('missing');
    cardCache[c.id] = data;
    if ($('#card-photo') === img) img.src = data;
  } catch {
    img.closest('.block')?.remove();
  }
}

function updateHero(c) {
  const n = $('#hero-name'); if (n) n.textContent = fullName(c);
  const s = $('#hero-sub'); if (s) s.textContent = subtitle(c);
  const a = $('#hero-av'); if (a) a.textContent = initials(c);
}

function onDetailInput(e) {
  const t = e.target;
  if (!t.name) return;
  if (S.view === 'new' && S.draft) {
    if (t.name === 'first_note') { S.draft._firstNote = t.value; return; }
    if (CONTACT_FIELDS.includes(t.name)) { S.draft[t.name] = t.value; updateHero(S.draft); }
    return;
  }
  if (S.view === 'contact' && CONTACT_FIELDS.includes(t.name)) {
    const c = getContact(S.currentId);
    if (!c) return;
    c[t.name] = t.value;
    c.updated_at = nowIso();
    pendingEdits.set(c.id, { ...(pendingEdits.get(c.id) || {}), [t.name]: t.value, updated_at: c.updated_at });
    updateHero(c);
    scheduleSave(c.id);
    renderCards();
  }
}

function onDetailChange(e) {
  // Save straight away when a field loses focus
  if (S.view === 'contact' && CONTACT_FIELDS.includes(e.target.name)) commitSave(S.currentId);
}

// ── Scanning ────────────────────────────────────────────────────────────

function scanView() {
  const sc = S.scan;
  return `
    <div class="detail">
      ${topBar('Scan a card')}
      ${sc ? `
        <div class="scan-progress" role="status">
          ${sc.preview ? `<img class="scan-preview" src="${sc.preview}" alt="">` : ''}
          <p class="scan-status" id="scan-status">${esc(sc.status)}</p>
          <div class="bar"><span id="scan-bar" style="width:${Math.round((sc.progress || 0) * 100)}%"></span></div>
          ${sc.error ? `<p class="auth-msg err">${esc(sc.error)}</p><button class="btn ghost" data-act="scan-reset">Try again</button>` : ''}
        </div>` : `
        <div class="scan-hero">
          <div class="scan-frame" aria-hidden="true">${ICON.scan}</div>
          <h2>Snap a business card</h2>
          <p class="muted">The card is read right on your device, then the details are filled in for you to check.</p>
          <label class="btn primary wide">
            ${ICON.camera}Take a photo
            <input class="sr-only" type="file" accept="image/*" capture="environment" data-scan-input>
          </label>
          <label class="btn ghost wide">
            ${ICON.image}Choose from photos
            <input class="sr-only" type="file" accept="image/*" data-scan-input>
          </label>
          <ul class="tips">
            <li>Lay the card flat on a plain surface</li>
            <li>Use good light and avoid glare</li>
            <li>Fill most of the frame with the card</li>
          </ul>
        </div>`}
    </div>`;
}

let tessPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (!tessPromise) {
    tessPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = resolve;
      s.onerror = () => { tessPromise = null; reject(new Error('Could not load the card reader. Check your internet connection.')); };
      document.head.appendChild(s);
    });
  }
  return tessPromise;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That photo couldn't be opened.")); };
    img.src = url;
  });
}
function drawScaled(img, maxSide, allowUpscale) {
  let s = maxSide / Math.max(img.naturalWidth, img.naturalHeight);
  s = allowUpscale ? Math.min(2, s) : Math.min(1, s);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
// Card photos are stored inside your database, so keep them small (well under its 1 MB limit).
function compactPhoto(img) {
  for (const [side, q] of [[1100, 0.7], [900, 0.6], [700, 0.5]]) {
    const url = drawScaled(img, side, false).toDataURL('image/jpeg', q);
    if (url.length < 600000) return url;
  }
  return null;
}
function enhanceForOcr(canvas) {
  const ctx = canvas.getContext('2d');
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = d.data;
  let min = 255, max = 0;
  const gray = new Uint8ClampedArray(px.length / 4);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    gray[j] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = ((gray[j] - min) / range) * 255;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return canvas;
}

async function handleScanFile(file) {
  if (!file) return;
  S.scan = { status: 'Preparing photo…', progress: 0.02 };
  renderDetail();
  let worker;
  try {
    const img = await loadImage(file);
    const store = compactPhoto(img);
    S.scan.preview = store;
    S.scan.status = 'Loading card reader…';
    renderDetail();
    await loadTesseract();
    const ocrCanvas = enhanceForOcr(drawScaled(img, 1800, true));
    worker = await window.Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (!S.scan) return;
        if (m.status === 'recognizing text') {
          S.scan.status = 'Reading the card…';
          S.scan.progress = 0.3 + 0.7 * (m.progress || 0);
        } else if (/loading|initializ/i.test(m.status)) {
          S.scan.status = 'Loading card reader… (the first time takes a moment)';
          S.scan.progress = Math.max(S.scan.progress, 0.05 + 0.25 * (m.progress || 0));
        }
        const st = $('#scan-status'); if (st) st.textContent = S.scan.status;
        const bar = $('#scan-bar'); if (bar) bar.style.width = `${Math.round(S.scan.progress * 100)}%`;
      },
    });
    const { data } = await worker.recognize(ocrCanvas);
    const fields = parseCard(data.text);
    S.draft = { ...emptyContact(), ...fields, _card: store, _raw: data.text.trim(), _fromScan: true };
    S.scan = null;
    S.view = 'new';
    renderLayout();
    $('#detail')?.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    if (S.scan) { S.scan.error = err.message || 'Something went wrong reading the card.'; S.scan.status = "Couldn't read the card"; renderDetail(); }
  } finally {
    if (worker) worker.terminate().catch(() => {});
  }
}

function emptyContact() {
  const c = { id: newId(), tags: S.filter !== 'all' ? [S.filter] : [], has_card: false, created_at: nowIso(), updated_at: nowIso() };
  CONTACT_FIELDS.forEach((f) => { c[f] = ''; });
  return c;
}

function saveNew() {
  const d = S.draft;
  if (!d) return;
  const form = $('#contact-form');
  if (form) CONTACT_FIELDS.forEach((f) => { d[f] = (form.elements[f]?.value || '').trim(); });
  if (!CONTACT_FIELDS.some((f) => d[f])) { toast('Add at least a name, company or email.'); return; }
  const c = { id: d.id, tags: d.tags || [], has_card: Boolean(d._card), created_at: nowIso(), updated_at: nowIso() };
  CONTACT_FIELDS.forEach((f) => { c[f] = d[f]; });

  const batch = writeBatch(db);
  batch.set(ref('contacts', c.id), contactDoc(c));
  if (d._card) { batch.set(ref('cards', c.id), { id: c.id, data: d._card }); cardCache[c.id] = d._card; }
  const noteBody = (($('#note-input')?.value) || d._firstNote || '').trim();
  if (noteBody) {
    const n = { id: newId(), contact_id: c.id, body: noteBody, created_at: nowIso() };
    batch.set(ref('notes', n.id), n);
    S.notes.unshift(n);
  }
  S.contacts.unshift(c);
  commit(batch.commit());

  S.draft = null;
  S.view = 'contact';
  S.currentId = c.id;
  renderLayout();
  toast('Contact saved');
}

// ── Notes ───────────────────────────────────────────────────────────────

function addNote(contactId, body) {
  const n = { id: newId(), contact_id: contactId, body, created_at: nowIso() };
  S.notes.unshift(n);
  const batch = writeBatch(db);
  batch.set(ref('notes', n.id), n);
  batch.set(ref('contacts', contactId), { updated_at: nowIso() }, { merge: true });
  commit(batch.commit());
}

// ── Tags / portfolios ───────────────────────────────────────────────────

function tagsView() {
  const count = (id) => S.contacts.filter((c) => (c.tags || []).includes(id)).length;
  return `
    <div class="detail">
      ${topBar('Portfolios & tags', `<button class="btn primary sm" data-act="new-tag">${ICON.plus}New</button>`)}
      <p class="muted intro">Group people by the parts of your work they're a good fit for. A person can belong to as many as you like, or none.</p>
      ${S.tags.length ? `<ul class="tag-list">${S.tags.map((t) => `
        <li>
          <button class="tag-item" data-filter-go="${t.id}">
            <span class="swatch" style="background:${pal(t.color).dot}" aria-hidden="true"></span>
            <span class="tag-name">${esc(t.name)}</span>
            <span class="muted">${count(t.id)} ${count(t.id) === 1 ? 'person' : 'people'}</span>
          </button>
          <button class="round soft" data-edit-tag="${t.id}" aria-label="Edit ${esc(t.name)}">${ICON.edit}</button>
        </li>`).join('')}</ul>` : `
        <div class="empty small"><p>No portfolios yet.</p><button class="btn primary" data-act="new-tag">${ICON.plus}Create your first</button></div>`}
    </div>`;
}

function openTagSheet(tagId = null, assign = false) {
  const t = tagId ? tagById(tagId) : null;
  let color = t?.color || Object.keys(COLORS)[S.tags.length % Object.keys(COLORS).length];
  const root = $('#sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" data-act="close-sheet"></div>
    <form class="sheet" id="tag-form" role="dialog" aria-modal="true" aria-labelledby="tag-sheet-title">
      <div class="sheet-grip" aria-hidden="true"></div>
      <h2 id="tag-sheet-title">${t ? 'Edit portfolio' : 'New portfolio'}</h2>
      <label class="field"><span>Name</span><input name="name" value="${esc(t?.name || '')}" placeholder="e.g. Real estate" required maxlength="40"></label>
      <fieldset class="swatches"><legend>Color</legend>
        ${Object.entries(COLORS).map(([k, p]) => `<button type="button" class="sw ${k === color ? 'on' : ''}" data-color="${k}" aria-label="${p.label}" aria-pressed="${k === color}" style="background:${p.dot}"></button>`).join('')}
      </fieldset>
      <div class="sheet-actions">
        ${t ? `<button type="button" class="btn danger" data-act="delete-tag">Delete</button>` : ''}
        <button type="button" class="btn ghost" data-act="close-sheet">Cancel</button>
        <button type="submit" class="btn primary">${t ? 'Save' : 'Create'}</button>
      </div>
    </form>`;
  const form = $('#tag-form');
  setTimeout(() => form.elements.name.focus(), 50);
  form.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-color]');
    if (sw) {
      color = sw.dataset.color;
      form.querySelectorAll('.sw').forEach((b) => { b.classList.toggle('on', b === sw); b.setAttribute('aria-pressed', b === sw); });
    }
    if (e.target.closest('[data-act="delete-tag"]') && t) {
      e.stopPropagation();
      if (!confirm(`Delete “${t.name}”? People keep their other tags and notes.`)) return;
      deleteTag(t.id);
      closeSheet();
      refreshAll();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) return;
    if (t) {
      t.name = name; t.color = color; t.updated_at = nowIso();
      commit(setDoc(ref('tags', t.id), { ...t }));
    } else {
      const nt = { id: newId(), name, color, created_at: nowIso(), updated_at: nowIso() };
      S.tags.push(nt);
      commit(setDoc(ref('tags', nt.id), nt));
      if (assign) toggleTag(nt.id, true);
    }
    closeSheet();
    refreshAll();
  });
}

function closeSheet() { const r = $('#sheet-root'); if (r) r.innerHTML = ''; }

function deleteTag(id) {
  commitAllSaves();
  const batch = writeBatch(db);
  S.contacts.forEach((c) => {
    if ((c.tags || []).includes(id)) {
      c.tags = c.tags.filter((x) => x !== id);
      batch.set(ref('contacts', c.id), { tags: c.tags }, { merge: true });
    }
  });
  if (S.draft) S.draft.tags = (S.draft.tags || []).filter((x) => x !== id);
  batch.delete(ref('tags', id));
  S.tags = S.tags.filter((t) => t.id !== id);
  if (S.filter === id) S.filter = 'all';
  commit(batch.commit());
}

function toggleTag(tagId, forceOn = null) {
  const target = S.view === 'new' ? S.draft : getContact(S.currentId);
  if (!target) return;
  const has = (target.tags || []).includes(tagId);
  const on = forceOn === null ? !has : forceOn;
  target.tags = on ? [...new Set([...(target.tags || []), tagId])] : (target.tags || []).filter((x) => x !== tagId);
  if (S.view !== 'new') {
    target.updated_at = nowIso();
    commit(setDoc(ref('contacts', target.id), { tags: target.tags, updated_at: target.updated_at }, { merge: true }));
  }
}

function refreshAll() {
  renderChips();
  renderCards();
  if (S.view === 'new') {
    const form = $('#contact-form');
    if (form && S.draft) CONTACT_FIELDS.forEach((f) => { if (form.elements[f]) S.draft[f] = form.elements[f].value; });
    const ni = $('#note-input'); if (ni && S.draft) S.draft._firstNote = ni.value;
  } else commitAllSaves();
  renderDetail();
}

// ── Settings sheet ──────────────────────────────────────────────────────

function openSettings() {
  const { label } = syncState();
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('#sheet-root').innerHTML = `
    <div class="sheet-backdrop" data-act="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="sheet-grip" aria-hidden="true"></div>
      <h2 id="settings-title">Account</h2>
      <p class="muted">Signed in as <strong>${esc(S.user.email)}</strong></p>
      <div class="settings-row">
        <div><strong>Sync</strong><p class="muted small">${label === 'Synced' ? 'Everything is saved to your account' : esc(label)}</p></div>
      </div>
      <div class="settings-row">
        <div><strong>Backup</strong><p class="muted small">Download all contacts, tags and notes as a spreadsheet file.</p></div>
        <button class="btn ghost sm" data-act="export">Export CSV</button>
      </div>
      ${standalone ? '' : `
      <div class="settings-row">
        <div><strong>Add to iPhone</strong><p class="muted small">In Safari, tap Share, then “Add to Home Screen”.</p></div>
      </div>`}
      <div class="sheet-actions">
        <button class="btn danger" data-act="signout">Sign out</button>
        <button class="btn primary" data-act="close-sheet">Done</button>
      </div>
    </div>`;
}

async function doSignOut() {
  commitAllSaves();
  if (Object.values(pendingWrites).some(Boolean)) {
    try {
      await Promise.race([waitForPendingWrites(db), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);
    } catch {
      if (!confirm("Some changes haven't reached your account yet, probably because you're offline. If you sign out now they may be lost. Sign out anyway?")) return;
    }
  }
  closeSheet();
  await signOut(auth);
}

// ── Exports ─────────────────────────────────────────────────────────────

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function exportCsv() {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['First name', 'Last name', 'Title', 'Company', 'Email', 'Phone', 'Website', 'Address', 'Portfolios', 'Notes', 'Added', 'Updated'];
  const rows = S.contacts.map((c) => [
    c.first_name, c.last_name, c.title, c.company, c.email, c.phone, c.website, c.address,
    // Commas so Airtable turns each portfolio into its own multiple-select option
    (c.tags || []).map((id) => tagById(id)?.name).filter(Boolean).join(', '),
    notesFor(c.id).map((n) => `${fmtDate(n.created_at)}: ${n.body}`).join(' | '),
    c.created_at, c.updated_at,
  ].map(cell).join(','));
  download(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, '\ufeff' + [head.map(cell).join(','), ...rows].join('\n'), 'text/csv;charset=utf-8');
}

function exportVcard(c) {
  const e = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
  const lines = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${e(c.last_name)};${e(c.first_name)};;;`,
    `FN:${e(fullName(c))}`,
    c.company && `ORG:${e(c.company)}`,
    c.title && `TITLE:${e(c.title)}`,
    c.email && `EMAIL;TYPE=INTERNET:${c.email}`,
    c.phone && `TEL;TYPE=CELL:${c.phone}`,
    c.website && `URL:${normUrl(c.website)}`,
    c.address && `ADR;TYPE=WORK:;;${e(c.address)};;;;`,
    'END:VCARD',
  ].filter(Boolean);
  download(`${fullName(c).replace(/[^\w ]+/g, '').trim() || 'contact'}.vcf`, lines.join('\r\n'), 'text/vcard');
}

// ── Click handling ──────────────────────────────────────────────────────

function onClick(e) {
  if (!S.user) return;
  const t = e.target;
  const open = t.closest('[data-open]');
  if (open) { commitAllSaves(); openView('contact', open.dataset.open); return; }

  const filter = t.closest('[data-filter]');
  if (filter) { S.filter = filter.dataset.filter; renderChips(); renderCards(); return; }

  const filterGo = t.closest('[data-filter-go]');
  if (filterGo) {
    S.filter = filterGo.dataset.filterGo;
    if (isDesktop()) { renderChips(); renderCards(); } else closeDetail();
    return;
  }

  const tt = t.closest('[data-toggle-tag]');
  if (tt) { toggleTag(tt.dataset.toggleTag); refreshAll(); return; }

  const delNote = t.closest('[data-del-note]');
  if (delNote) {
    if (!confirm('Delete this note?')) return;
    const id = delNote.dataset.delNote;
    S.notes = S.notes.filter((n) => n.id !== id);
    const batch = writeBatch(db);
    batch.delete(ref('notes', id));
    commit(batch.commit());
    renderDetail();
    renderCards();
    return;
  }

  const editTag = t.closest('[data-edit-tag]');
  if (editTag) { openTagSheet(editTag.dataset.editTag); return; }

  const act = t.closest('[data-act]')?.dataset.act;
  if (!act) return;
  switch (act) {
    case 'new': commitAllSaves(); S.draft = emptyContact(); openView('new'); break;
    case 'go-list': if (S.view !== 'list') closeDetail(); else $('#cards')?.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'go-scan': commitAllSaves(); S.scan = null; openView('scan'); break;
    case 'go-tags': commitAllSaves(); openView('tags'); break;
    case 'close': closeDetail(); break;
    case 'settings': openSettings(); break;
    case 'close-sheet': closeSheet(); break;
    case 'sort': S.sort = S.sort === 'recent' ? 'az' : 'recent'; renderCards(); break;
    case 'sync':
      commitAllSaves();
      S.writeError = null;
      updateSync();
      toast(navigator.onLine ? 'Your changes sync automatically.' : "You're offline. Changes are saved on this device and will sync when you reconnect.");
      break;
    case 'export': exportCsv(); break;
    case 'signout': doSignOut(); break;
    case 'save-new': saveNew(); break;
    case 'new-tag': openTagSheet(null, S.view === 'contact' || S.view === 'new'); break;
    case 'scan-reset': S.scan = null; renderDetail(); break;
    case 'add-note': {
      const input = $('#note-input');
      const body = input?.value.trim();
      if (!body) { input?.focus(); return; }
      addNote(S.currentId, body);
      renderDetail();
      renderCards();
      break;
    }
    case 'vcard': { const c = getContact(S.currentId); if (c) exportVcard(c); break; }
    case 'delete': {
      const c = getContact(S.currentId);
      if (!c || !confirm(`Delete ${fullName(c)}? This removes their notes too and can't be undone.`)) return;
      clearTimeout(saveTimers.get(c.id));
      saveTimers.delete(c.id);
      pendingEdits.delete(c.id);
      const batch = writeBatch(db);
      batch.delete(ref('contacts', c.id));
      notesFor(c.id).forEach((n) => batch.delete(ref('notes', n.id)));
      if (c.has_card) batch.delete(ref('cards', c.id));
      S.contacts = S.contacts.filter((x) => x.id !== c.id);
      S.notes = S.notes.filter((n) => n.contact_id !== c.id);
      commit(batch.commit());
      S.currentId = null;
      closeDetail();
      toast('Contact deleted');
      break;
    }
    default: break;
  }
}

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-scan-input]')) handleScanFile(e.target.files?.[0]);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#sheet-root')?.innerHTML) closeSheet();
});

// ── Offline app shell ───────────────────────────────────────────────────

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker failed', e));
}

try {
  init();
} catch (e) {
  console.error(e);
  $('#app').innerHTML = `<main class="auth"><div class="auth-card"><h1>Can't start</h1><p class="muted">${esc(e.message || e)}</p><button class="btn primary wide" onclick="location.reload()">Try again</button></div></main>`;
}
