// Фильтр строк во всех таблицах страницы по введённому тексту
document.querySelectorAll('input.filter').forEach(function (input) {
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    document.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.hidden = q && !tr.textContent.toLowerCase().includes(q);
    });
  });
});
