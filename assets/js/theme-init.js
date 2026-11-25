/* Runs before first paint: marks JS as available and applies the saved or system color theme. */
(function () {
  var d = document.documentElement;
  d.classList.remove('no-js');
  d.classList.add('js');
  var t = null;
  try { t = localStorage.getItem('theme'); } catch (e) { /* storage blocked */ }
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  d.setAttribute('data-theme', t);
})();
