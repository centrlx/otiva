import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCS7DTZmrxUQ8_aJnSHIR29AkZK3FYFEo0",
  authDomain: "otivaapp.firebaseapp.com",
  projectId: "otivaapp",
  storageBucket: "otivaapp.firebasestorage.app",
  messagingSenderId: "395135644067",
  appId: "1:395135644067:web:317bb242d68fc686adaa16",
  measurementId: "G-R607QY45W6"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Без экспериментальных флагов транспорта — форсированный long-polling не подтвердился
// измерениями (даже одноразовые getDoc/getDocs шли по 4-10с), так что тут дефолтное
// поведение SDK. Если в конкретном браузере/сети будет ошибка
// "Fetch API cannot load .../Listen/channel" (как раньше ловили в Safari) — вернуть
// вторым аргументом { experimentalAutoDetectLongPolling: true }.
//
// persistentLocalCache — офлайн-кэш Firestore в IndexedDB. Это MPA: каждый переход —
// полная перезагрузка страницы и новая инициализация Firestore с нуля. Без кэша это
// значит, что даже повторное открытие того же объявления снова ждёт сеть. С кэшем
// SDK сперва отдаёт то, что уже есть на диске (мгновенно), и досинхронизирует свежие
// данные в фоне через те же onSnapshot — realtime не отключается, просто первый кадр
// не пустой. persistentMultipleTabManager — чтобы не падать, если сайт открыт в
// нескольких вкладках одновременно.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
