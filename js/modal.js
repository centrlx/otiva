function ensureHost() {
  let host = document.getElementById('modal-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'modal-host';
    document.body.appendChild(host);
  }
  return host;
}

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

export function finalizeSaleModal({ listingTitle, hasQty }) {
  return new Promise((resolve) => {
    const host = ensureHost();

    function renderChoice() {
      host.innerHTML = `
        <div class="modal-backdrop" id="modal-backdrop">
          <div class="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="modal-title">
            <h3 class="mt-0" id="modal-title">Сделка завершена 🎉</h3>
            <p class="modal-card__msg">«${listingTitle}» — товар раскуплен, объявление скрыто как проданное. Оставить его активным?</p>
            <div class="modal-card__actions">
              <button type="button" class="btn btn-ghost" id="modal-hide-btn">Пусть остаётся продано</button>
              <button type="button" class="btn btn-primary" id="modal-keep-btn">Оставить активным</button>
            </div>
          </div>
        </div>
      `;
      const backdrop = document.getElementById('modal-backdrop');
      document.getElementById('modal-hide-btn').addEventListener('click', () => finish(null));
      document.getElementById('modal-keep-btn').addEventListener('click', () => {
        if (hasQty) renderQtyStep();
        else finish(true);
      });
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });
      document.addEventListener('keydown', onKey);
      requestAnimationFrame(() => backdrop.classList.add('is-open'));
    }

    function renderQtyStep() {
      host.innerHTML = `
        <div class="modal-backdrop is-open" id="modal-backdrop">
          <div class="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="modal-title">
            <h3 class="mt-0" id="modal-title">Сколько осталось в наличии?</h3>
            <form id="modal-qty-form">
              <div class="field">
                <label for="modal-qty-input">Количество, шт</label>
                <input type="number" id="modal-qty-input" min="1" step="1" value="1" required autofocus />
              </div>
              <div class="modal-card__actions">
                <button type="button" class="btn btn-ghost" id="modal-back-btn">Назад</button>
                <button type="submit" class="btn btn-primary">Сохранить и оставить активным</button>
              </div>
            </form>
          </div>
        </div>
      `;
      const backdrop = document.getElementById('modal-backdrop');
      document.getElementById('modal-back-btn').addEventListener('click', renderChoice);
      document.getElementById('modal-qty-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const qty = Math.max(1, Number(document.getElementById('modal-qty-input').value) || 1);
        finish({ quantity: qty });
      });
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });
      document.getElementById('modal-qty-input').focus();
    }

    function onKey(e) {
      if (e.key === 'Escape') finish(null);
    }

    function finish(result) {
      const backdrop = document.getElementById('modal-backdrop');
      backdrop?.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => { host.innerHTML = ''; }, 150);
      resolve(result);
    }

    renderChoice();
  });
}
