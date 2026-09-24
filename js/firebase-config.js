import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
// experimentalAutoDetectLongPolling каждый раз ЗАНОВО прогоняет пробную детекцию транспорта
// (пробует потоковый WebChannel, ждёт, при неудаче откатывается на long-polling) — а поскольку
// это multi-page app и на каждой странице сразу открывается realtime-бейдж непрочитанных
// сообщений (см. chat.js/watchUnreadBadge, вызывается из auth.js на КАЖДОЙ странице), эта
// детекция перезапускается при каждом переходе. Именно она и давала стабильные ~10с зависания
// в сетях, где потоковый fetch не проходит (тот же класс проблемы, что ловили в Safari).
// experimentalForceLongPolling пропускает детекцию и сразу использует long-polling —
// без гонки/таймаута на каждой загрузке страницы.
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });
