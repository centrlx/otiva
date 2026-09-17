import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db } from './firebase-config.js';
import { CITIES } from './constants.js';
import { renderIcons } from './utils.js';
import { mountThemeSwitcher } from './theme.js';
import { watchUnreadBadge } from './chat.js';

let currentUser = null;
let currentProfile = null;
let resolveReady;
const readyPromise = new Promise((res) => { resolveReady = res; });

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  currentProfile = user ? await fetchProfile(user.uid) : null;
  resolveReady({ user: currentUser, profile: currentProfile });
  renderHeaderAuthArea();
});

async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function authReady() {
  return readyPromise;
}

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentProfile() {
  return currentProfile;
}

export async function refreshProfile() {
  if (currentUser) currentProfile = await fetchProfile(currentUser.uid);
  return currentProfile;
}

export async function registerUser({ email, password, displayName, city, phone }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  const profile = {
    email,
    displayName,
    city: city || '',
    phone: phone || '',
    role: 'user',
    ratingAvg: 0,
    ratingCount: 0,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'users', cred.user.uid), profile);
  currentUser = cred.user;
  currentProfile = { id: cred.user.uid, ...profile };
  return cred.user;
}

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  currentUser = cred.user;
  currentProfile = await fetchProfile(cred.user.uid);
  return cred.user;
}

export async function logoutUser() {
  await signOut(auth);
  currentUser = null;
  currentProfile = null;
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// Ждём инициализации auth и, если пользователь не вошёл, уводим на страницу входа.
export async function requireAuth() {
  const { user, profile } = await readyPromise;
  if (!user) {
    const back = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `auth.html?redirect=${back}`;
    return null;
  }
  return { user, profile };
}

export async function requireAdmin() {
  const result = await requireAuth();
  if (!result) return null;
  if (result.profile?.role !== 'admin') {
    window.location.href = 'index.html';
    return null;
  }
  return result;
}

const CITY_KEY = 'otiva_city';

function initials(name, email) {
  const src = (name || email || '?').trim();
  return src.slice(0, 1).toUpperCase();
}

function renderHeaderAuthArea() {
  const area = document.getElementById('header-auth-area');
  if (!area) return;
  if (currentUser) {
    const name = currentProfile?.displayName || currentUser.email;
    const isAdmin = currentProfile?.role === 'admin';
    area.innerHTML = `
      <a class="header-icon-link" href="messages.html" title="Сообщения" id="messages-icon-link">
        <i data-lucide="message-circle" class="icon"></i>
        <span class="header-badge" id="messages-badge" hidden></span>
      </a>
      ${isAdmin ? `
        <a class="header-icon-link" href="admin.html" title="Админ-панель">
          <i data-lucide="shield" class="icon"></i>
        </a>` : ''}
      <a class="user-chip" href="profile.html">
        <span class="user-chip__avatar">${initials(name)}</span>
        <span class="user-chip__name">${name}</span>
      </a>
    `;
    try {
      watchUnreadBadge((count) => {
        const badge = document.getElementById('messages-badge');
        if (!badge) return;
        badge.hidden = count === 0;
        badge.textContent = count > 9 ? '9+' : String(count);
      });
    } catch (err) {
      console.error('watchUnreadBadge failed:', err);
    }
  } else {
    area.innerHTML = `<a class="btn btn-ghost btn-sm" href="auth.html">Войти</a>`;
  }
  renderIcons();
}

export function mountHeader() {
  const host = document.getElementById('app-header');
  if (!host) return;
  const savedCity = localStorage.getItem(CITY_KEY) || '';
  host.innerHTML = `
    <div class="container header-inner">
      <a href="index.html" class="brand">OTIVA</a>
      <form class="header-search" id="header-search-form" action="index.html" method="get">
        <i data-lucide="search" class="icon"></i>
        <input type="search" name="q" placeholder="Поиск по объявлениям, категориям..." autocomplete="off" />
        <button type="submit" aria-label="Искать"><i data-lucide="arrow-right" class="icon"></i></button>
      </form>
      <select class="header-city" id="header-city-select" title="Город">
        <option value="">Весь Казахстан</option>
        ${CITIES.map((c) => `<option value="${c}" ${c === savedCity ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <div id="theme-switcher-slot"></div>
      <nav class="header-nav" id="header-auth-area">
        <a class="btn btn-ghost btn-sm" href="auth.html">Войти</a>
      </nav>
      <a class="btn btn-primary btn-sm header-cta" href="listing-form.html">
        <i data-lucide="plus" class="icon" style="width:16px;height:16px;"></i>
        <span class="header-cta__text">Разместить объявление</span>
      </a>
    </div>
  `;
  mountThemeSwitcher(document.getElementById('theme-switcher-slot'));
  document.getElementById('header-city-select').addEventListener('change', (e) => {
    localStorage.setItem(CITY_KEY, e.target.value);
    window.dispatchEvent(new CustomEvent('otiva:city-changed', { detail: e.target.value }));
  });
  renderHeaderAuthArea();
}
