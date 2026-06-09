/* ============================================================
   Everyday Vet — Business Plan microsite interactions
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- Scroll progress bar ---------- */
    const progress = document.getElementById('scrollProgress');
    const header = document.querySelector('header');
    const hero = document.querySelector('#hero');
    const heroContent = document.querySelector('.hero-content');

    function onScroll() {
        const scrolled = window.pageYOffset;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (progress) progress.style.width = `${(scrolled / docHeight) * 100}%`;
        if (header) header.classList.toggle('scrolled', scrolled > 50);

        // Hero parallax (skip if reduced motion)
        if (!reduceMotion && heroContent && scrolled < window.innerHeight) {
            heroContent.style.transform = `translateY(${scrolled * 0.3}px)`;
            heroContent.style.opacity = `${1 - scrolled * 0.0016}`;
        }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------- Count-up animation ---------- */
    function animateCount(el) {
        const target = parseFloat(el.dataset.count);
        const decimals = parseInt(el.dataset.decimals || '0', 10);
        const prefix = el.dataset.prefix || '';
        const suffix = el.dataset.suffix || '';
        const comma = el.dataset.format === 'comma';
        const duration = 1600;
        const start = performance.now();

        function fmt(v) {
            let n = v.toFixed(decimals);
            if (comma) n = parseInt(n, 10).toLocaleString('en-US');
            return prefix + n + suffix;
        }
        function tick(now) {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
            el.textContent = fmt(target * eased);
            if (p < 1) requestAnimationFrame(tick);
            else el.textContent = fmt(target);
        }
        requestAnimationFrame(tick);
    }

    /* ---------- Bar chart grow ---------- */
    function growChart(chart) {
        chart.querySelectorAll('.bar').forEach(bar => {
            bar.style.height = `${bar.dataset.height}%`;
        });
        chart.classList.add('charted');
    }

    /* ---------- Reveal observer ---------- */
    const revealObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            el.classList.add('visible');

            // Count-up for stat numbers within the revealed element
            el.querySelectorAll('.stat-num[data-count]').forEach(num => {
                if (!num.dataset.done) { num.dataset.done = '1'; if (!reduceMotion) animateCount(num); else num.textContent = (num.dataset.prefix||'') + num.dataset.count + (num.dataset.suffix||''); }
            });
            obs.unobserve(el);
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.fade-in').forEach(el => revealObserver.observe(el));

    /* Stagger children within grids */
    document.querySelectorAll('.stat-grid, .problem-grid, .services-grid, .ask-grid, .pricing-grid, .why-works, .fin-metrics, .contact-methods, .vision-grid, .ops-grid, .summary-callouts, .capital-cards').forEach(grid => {
        grid.querySelectorAll('.fade-in').forEach((el, i) => {
            el.style.setProperty('--stagger', `${Math.min(i * 0.08, 0.5)}s`);
            el.style.transitionDelay = `${Math.min(i * 0.08, 0.5)}s`;
        });
    });

    /* Dedicated observer for the bar chart */
    const barChart = document.getElementById('barChart');
    if (barChart) {
        const chartObs = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (reduceMotion) barChart.querySelectorAll('.bar').forEach(b => b.style.height = `${b.dataset.height}%`);
                    growChart(barChart);
                    obs.unobserve(barChart);
                }
            });
        }, { threshold: 0.35 });
        chartObs.observe(barChart);
    }

    /* ---------- Mobile menu ---------- */
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    const overlay = document.querySelector('.nav-overlay');

    if (menuBtn && navLinks) {
        const toggle = () => {
            menuBtn.classList.toggle('active');
            navLinks.classList.toggle('active');
            overlay && overlay.classList.toggle('active');
            document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
        };
        const close = () => {
            menuBtn.classList.remove('active');
            navLinks.classList.remove('active');
            overlay && overlay.classList.remove('active');
            document.body.style.overflow = '';
        };
        menuBtn.addEventListener('click', toggle);
        overlay && overlay.addEventListener('click', close);
        navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
        window.addEventListener('resize', () => { if (window.innerWidth > 768) close(); });
    }
});
