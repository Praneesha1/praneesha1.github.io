// Small page behaviours: nav toggle, reveal on scroll, year stamp.
(function () {
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav-toggle');
  if (toggle) toggle.addEventListener('click', () => nav.classList.toggle('open'));
  document.querySelectorAll('.nav-links a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));

  // reveal on scroll: plain rect check, no observer dependency
  let pending = Array.from(document.querySelectorAll('.rv'));
  let ticking = false;
  const check = () => {
    ticking = false;
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    pending = pending.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh - 24 && r.bottom > 0) { el.classList.add('in'); return false; }
      return true;
    });
    if (!pending.length) { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(check); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('load', check);
  document.addEventListener('DOMContentLoaded', check);
  check(); setTimeout(check, 300); setTimeout(check, 1200);

  const root = document.documentElement;
  const tb = document.querySelector('[data-theme-toggle]');
  const label = () => { if (tb) tb.querySelector('span').textContent = root.getAttribute('data-theme') === 'light' ? 'Graphite' : 'Paper'; };
  label();
  if (tb) tb.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    label();
  });

  // view router for the home page: one view visible at a time, hash in the URL
  const views = Array.from(document.querySelectorAll('.view'));
  if (views.length) {
    const ids = views.map((v) => v.id);
    const show = (raw) => {
      const id = ids.includes(raw) ? raw : 'home';
      views.forEach((v) => { v.hidden = v.id !== id; });
      document.querySelectorAll('.nav-links a[href^="#"]').forEach((a) => a.classList.toggle('current', a.getAttribute('href') === '#' + id));
      const v = document.getElementById(id);
      v.querySelectorAll('.rv').forEach((el) => { el.classList.remove('in'); if (!pending.includes(el)) pending.push(el); });
      window.scrollTo(0, 0);
      nav.classList.remove('open');
      window.addEventListener('scroll', onScroll, { passive: true });
      requestAnimationFrame(() => { check(); setTimeout(check, 250); });
      document.title = (id === 'home' ? '' : v.querySelector('h2, h1')?.textContent.trim() + ' · ') + 'Gajadi Praneesha · Mechanical Design Portfolio';
    };
    window.addEventListener('hashchange', () => show(location.hash.slice(1)));
    show(location.hash.slice(1));
  }
  document.querySelectorAll('[data-scroll-top]').forEach((b) => b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' })));

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
