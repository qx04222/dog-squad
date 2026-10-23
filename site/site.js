(() => {
  const reveal = [...document.querySelectorAll('.reveal')];
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12 });
    reveal.forEach((element) => observer.observe(element));
  } else reveal.forEach((element) => element.classList.add('visible'));
  const year = document.querySelector('#year');
  if (year) year.textContent = new Date().getFullYear();
})();
