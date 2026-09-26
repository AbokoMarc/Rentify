(function () {
  const saved = localStorage.getItem('lokaya_theme') || localStorage.getItem('rentify_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('lokaya_theme', next);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerHTML = next === 'light' ? ICONS.moon : ICONS.sun;
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerHTML = (document.documentElement.getAttribute('data-theme') === 'dark') ? ICONS.sun : ICONS.moon;
});
