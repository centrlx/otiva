function ensureHost() {
  let host = document.getElementById('modal-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'modal-host';
    document.body.appendChild(host);
  }
  return host;
}

// Красивая замена window.confirm(). Возвращает Promise<boolean>.
export function confirmModal(options = {}) {
  const {
    title = 'Подтвердите действие',
    message = '',
    confirmText = 'Удалить',
    cancelText = 'Отмена',
    danger = true,
  } = typeof options === 'string' ? { message: options } : options;

  return new Promise((resolve) => {
    const host = ensureHost();
    host.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="modal-title">
          <h3 class="mt-0" id="modal-title">${title}</h3>
          <p class="modal-card__msg">${message}</p>
          <div class="modal-card__actions">
            <button type="button" class="btn btn-ghost" id="modal-cancel-btn">${cancelText}</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm-btn">${confirmText}</button>
          </div>
        </div>
      </div>
    `;

    const backdrop = document.getElementById('modal-backdrop');

    function onKey(e) {
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    }

    function finish(result) {
      backdrop.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => { host.innerHTML = ''; }, 150);
      resolve(result);
    }

    document.getElementById('modal-cancel-btn').addEventListener('click', () => finish(false));
    document.getElementById('modal-confirm-btn').addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(false); });
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => backdrop.classList.add('is-open'));
    document.getElementById('modal-confirm-btn').focus();
  });
}
