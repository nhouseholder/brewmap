// BrewMap — Mobile Bottom Sheet

(function() {
  if (window.innerWidth > 768) return;
  const sidebar = document.querySelector('.sidebar');
  const handle = sidebar?.querySelector('.sheet-handle');
  if (!handle) return;

  const SNAP_PEEK = 25;
  const SNAP_HALF = 50;
  const SNAP_FULL = 85;
  let startY = 0, startH = 0, dragging = false;

  function getMainHeight() {
    return sidebar.parentElement.offsetHeight;
  }

  function snapTo(pct) {
    sidebar.classList.remove('dragging');
    sidebar.style.height = pct + '%';
    const btns = document.querySelectorAll('.find-near-me-btn,.map-locate-btn');
    btns.forEach(b => b.style.bottom = (pct + 5) + '%');
  }

  handle.addEventListener('touchstart', function(e) {
    dragging = true;
    startY = e.touches[0].clientY;
    startH = sidebar.offsetHeight;
    sidebar.classList.add('dragging');
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', function(e) {
    if (!dragging) return;
    const dy = startY - e.touches[0].clientY;
    const mainH = getMainHeight();
    const newH = Math.max(mainH * 0.15, Math.min(mainH * 0.85, startH + dy));
    sidebar.style.height = newH + 'px';
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', function() {
    if (!dragging) return;
    dragging = false;
    const mainH = getMainHeight();
    const pct = (sidebar.offsetHeight / mainH) * 100;
    const snaps = [SNAP_PEEK, SNAP_HALF, SNAP_FULL];
    const nearest = snaps.reduce((a, b) => Math.abs(b - pct) < Math.abs(a - pct) ? b : a);
    snapTo(nearest);
  });

  handle.addEventListener('click', function() {
    const mainH = getMainHeight();
    const pct = (sidebar.offsetHeight / mainH) * 100;
    snapTo(pct < 40 ? SNAP_HALF : SNAP_PEEK);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      sidebar.style.height = '';
      sidebar.classList.remove('dragging');
    }
  });
})();
