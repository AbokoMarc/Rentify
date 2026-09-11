(function () {
  const saved = localStorage.getItem('rentify_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('rentify_theme', next);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = next === 'light' ? '🌙' : '☀️';
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = (document.documentElement.getAttribute('data-theme') === 'dark') ? '☀️' : '🌙';
});
