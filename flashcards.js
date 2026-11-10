// Флеш-карточки с интервальным повторением (упрощённый Лейтнер).
// Слова берутся из таблиц страницы: 1-я колонка — испанский, 2-я — русский, 3-я — пример.
// Прогресс хранится в localStorage этого браузера.
(function () {
  var STORE = 'fc-v1';
  var DAYS = [0, 1, 3, 7, 14, 30];
  var DAY = 86400000;
  var NEW_PER_SESSION = 20;
  var LEARNED_BOX = 4;

  var memory = {};
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return memory; }
  }
  function save(data) {
    memory = data;
    try { localStorage.setItem(STORE, JSON.stringify(data)); } catch (e) {}
  }

  // Путь страницы без домена и имени репозитория: "basta-ya/lexico.html"
  var page = location.pathname.split('/').filter(Boolean).slice(-2).join('/');

  function cellHTML(td) {
    if (!td) return '';
    var c = td.cloneNode(true);
    c.querySelectorAll('a').forEach(function (a) { a.replaceWith(document.createTextNode(a.textContent)); });
    return c.innerHTML.trim();
  }

  function collect() {
    var cards = [];
    document.querySelectorAll('table:not(.conj) tbody tr').forEach(function (tr) {
      if (tr.closest('[hidden]')) return;
      var td = tr.querySelectorAll('td');
      if (td.length < 2) return;
      var es = td[0].textContent.trim();
      if (!es) return;
      cards.push({ id: page + '|' + es, es: cellHTML(td[0]), ru: cellHTML(td[1]), ex: cellHTML(td[2]) });
    });
    return cards;
  }

  function key(card, dir) { return card.id + '|' + dir; }

  function counts(dir) {
    var data = load(), now = Date.now(), c = { new: 0, due: 0, learned: 0 };
    collect().forEach(function (card) {
      var r = data[key(card, dir)];
      if (!r) c.new++;
      else {
        if (r.d <= now) c.due++;
        if (r.b >= LEARNED_BOX) c.learned++;
      }
    });
    return c;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------- Панель на странице ----------
  var anchor = document.querySelector('input.filter') || document.querySelector('.table-wrap');
  if (!anchor || !collect().length) return;

  var panel = document.createElement('div');
  panel.className = 'fc-panel';
  panel.innerHTML =
    '<div class="fc-start">' +
      '<button type="button" class="fc-btn" data-dir="es">Карточки ES → RU</button>' +
      '<button type="button" class="fc-btn" data-dir="ru">Карточки RU → ES</button>' +
    '</div>' +
    '<div class="fc-stats"></div>' +
    '<div class="fc-links">' +
      '<button type="button" class="fc-link" data-act="export">Сохранить прогресс</button> · ' +
      '<button type="button" class="fc-link" data-act="import">Загрузить прогресс</button>' +
      '<input type="file" accept=".json,application/json" hidden>' +
    '</div>';
  anchor.parentNode.insertBefore(panel, anchor);

  function renderStats() {
    var hint = document.querySelector('input.filter') && document.querySelector('input.filter').value.trim()
      ? ' <span class="fc-hint">(только найденные строки)</span>' : '';
    panel.querySelector('.fc-stats').innerHTML = ['es', 'ru'].map(function (dir) {
      var c = counts(dir);
      return '<span><strong>' + (dir === 'es' ? 'ES → RU' : 'RU → ES') + ':</strong> новых ' + c.new +
        ' · повторить ' + c.due + ' · выучено ' + c.learned + '</span>';
    }).join('') + hint;
  }
  renderStats();
  var filter = document.querySelector('input.filter');
  if (filter) filter.addEventListener('input', function () { setTimeout(renderStats, 0); });

  panel.querySelectorAll('[data-dir]').forEach(function (b) {
    b.addEventListener('click', function () { startSession(b.dataset.dir, false); });
  });

  // ---------- Экспорт / импорт ----------
  var fileInput = panel.querySelector('input[type=file]');
  panel.querySelector('[data-act=export]').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(load(), null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'espanol-b2-progreso-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  panel.querySelector('[data-act=import]').addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    var f = fileInput.files[0];
    if (!f) return;
    f.text().then(function (txt) {
      var incoming = JSON.parse(txt), data = load(), n = 0;
      Object.keys(incoming).forEach(function (k) {
        var r = incoming[k];
        if (!r || typeof r.b !== 'number') return;
        if (!data[k] || (r.t || 0) > (data[k].t || 0)) { data[k] = r; n++; }
      });
      save(data);
      renderStats();
      alert('Прогресс загружен: обновлено карточек — ' + n + '.');
    }).catch(function () {
      alert('Не получилось прочитать файл. Нужен файл, сохранённый кнопкой «Сохранить прогресс».');
    });
    fileInput.value = '';
  });

  // ---------- Режим карточек ----------
  var overlay, queue, current, flipped, dir, tally;

  function startSession(d, all) {
    dir = d;
    var data = load(), now = Date.now(), cards = collect();
    if (all) queue = shuffle(cards.slice());
    else {
      var due = cards.filter(function (c) { var r = data[key(c, dir)]; return r && r.d <= now; });
      var fresh = cards.filter(function (c) { return !data[key(c, dir)]; }).slice(0, NEW_PER_SESSION);
      queue = shuffle(due).concat(shuffle(fresh));
    }
    tally = { no: 0, hard: 0, yes: 0 };
    openOverlay();
    if (queue.length) next(); else empty();
  }

  function openOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'fc-overlay';
    overlay.innerHTML =
      '<div class="fc-top"><span class="fc-left"></span>' +
      '<button type="button" class="fc-close" aria-label="Закрыть">×</button></div>' +
      '<div class="fc-body"></div>';
    document.body.appendChild(overlay);
    document.body.classList.add('fc-open');
    overlay.querySelector('.fc-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
  }

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    document.body.classList.remove('fc-open');
    renderStats();
  }

  function body(html) { overlay.querySelector('.fc-body').innerHTML = html; }
  function left(text) { overlay.querySelector('.fc-left').textContent = text; }

  function next() {
    if (!queue.length) return finish();
    current = queue.shift();
    flipped = false;
    left('Осталось: ' + (queue.length + 1));
    var front = dir === 'es' ? current.es : current.ru;
    body('<div class="fc-card" tabindex="0"><div class="fc-front">' + front + '</div></div>' +
      '<div class="fc-actions"><button type="button" class="fc-btn fc-show">Показать ответ</button></div>');
    overlay.querySelector('.fc-card').addEventListener('click', flip);
    overlay.querySelector('.fc-show').addEventListener('click', flip);
  }

  function flip() {
    if (flipped) return;
    flipped = true;
    var back = dir === 'es' ? current.ru : current.es;
    var card = overlay.querySelector('.fc-card');
    card.classList.add('fc-flipped');
    card.insertAdjacentHTML('beforeend', '<div class="fc-back">' + back + '</div>' +
      (current.ex ? '<div class="fc-ex">' + current.ex + '</div>' : ''));
    overlay.querySelector('.fc-actions').innerHTML =
      '<button type="button" class="fc-grade fc-no" data-g="no">Не знаю <kbd>1</kbd></button>' +
      '<button type="button" class="fc-grade fc-hard" data-g="hard">Трудно <kbd>2</kbd></button>' +
      '<button type="button" class="fc-grade fc-yes" data-g="yes">Знаю <kbd>3</kbd></button>';
    overlay.querySelectorAll('.fc-grade').forEach(function (b) {
      b.addEventListener('click', function () { grade(b.dataset.g); });
    });
  }

  function grade(g) {
    if (!flipped) return;
    var data = load(), k = key(current, dir), r = data[k] || { b: 0 }, now = Date.now();
    if (g === 'yes') { r.b = Math.min(r.b + 1, DAYS.length - 1); r.d = now + DAYS[r.b] * DAY; }
    else if (g === 'hard') { r.d = now + DAY; }
    else { r.b = 0; r.d = now; queue.push(current); }
    r.t = now;
    data[k] = r;
    save(data);
    tally[g]++;
    next();
  }

  function finish() {
    left('');
    body('<div class="fc-done"><h2>Готово!</h2>' +
      '<p>Знаю: <strong>' + tally.yes + '</strong> · Трудно: <strong>' + tally.hard +
      '</strong> · Не знаю: <strong>' + tally.no + '</strong></p>' +
      '<button type="button" class="fc-btn fc-end">Закрыть</button></div>');
    overlay.querySelector('.fc-end').addEventListener('click', close);
  }

  function empty() {
    left('');
    body('<div class="fc-done"><h2>На сегодня всё</h2>' +
      '<p>Новых карточек нет, а повторять ещё рано.</p>' +
      '<button type="button" class="fc-btn fc-all">Пройти все карточки ещё раз</button> ' +
      '<button type="button" class="fc-link fc-end">Закрыть</button></div>');
    overlay.querySelector('.fc-all').addEventListener('click', function () { close(); startSession(dir, true); });
    overlay.querySelector('.fc-end').addEventListener('click', close);
  }

  function onKey(e) {
    if (e.key === 'Escape') return close();
    if (!current || !overlay.querySelector('.fc-card')) return;
    if ((e.key === ' ' || e.key === 'Enter') && !flipped) { e.preventDefault(); flip(); }
    else if (e.key === '1') grade('no');
    else if (e.key === '2') grade('hard');
    else if (e.key === '3') grade('yes');
  }
})();
