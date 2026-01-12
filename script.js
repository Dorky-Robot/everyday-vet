// Parallax effect for hero section
function initParallax() {
    const hero = document.querySelector('#hero');
    const heroContent = document.querySelector('.hero-content');

    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const rate = scrolled * 0.5;

        if (hero) {
            hero.style.backgroundPositionY = `${rate}px`;
        }
        if (heroContent) {
            heroContent.style.transform = `translateY(${scrolled * 0.3}px)`;
            heroContent.style.opacity = 1 - (scrolled * 0.002);
        }
    });
}

// Horizontal scroll for services section
function initHorizontalScroll() {
    const horizontalSection = document.querySelector('.horizontal-scroll-container');
    const horizontalContent = document.querySelector('.horizontal-scroll-content');

    if (!horizontalSection || !horizontalContent) return;

    const totalScrollWidth = horizontalContent.scrollWidth - window.innerWidth;
    const sectionHeight = horizontalSection.offsetHeight - window.innerHeight;

    window.addEventListener('scroll', () => {
        const rect = horizontalSection.getBoundingClientRect();
        const sectionTop = horizontalSection.offsetTop;
        const scrollPosition = window.pageYOffset - sectionTop;

        if (rect.top <= 0 && rect.bottom >= window.innerHeight) {
            const progress = Math.min(Math.max(scrollPosition / sectionHeight, 0), 1);
            const translateX = -progress * totalScrollWidth;
            horizontalContent.style.transform = `translateX(${translateX}px)`;
        }
    });
}

// Fade in elements on scroll
function initScrollAnimations() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-in, .slide-in-left, .slide-in-right, .service-card, .pricing-card').forEach(el => {
        observer.observe(el);
    });
}

// Smooth parallax for multiple layers
function initLayeredParallax() {
    const parallaxElements = document.querySelectorAll('[data-parallax]');

    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;

        parallaxElements.forEach(el => {
            const speed = parseFloat(el.dataset.parallax) || 0.5;
            const yPos = -(scrolled * speed);
            el.style.transform = `translateY(${yPos}px)`;
        });
    });
}

// Navbar background on scroll
function initNavbarScroll() {
    const header = document.querySelector('header');

    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

// Mobile menu toggle
function initMobileMenu() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    const overlay = document.querySelector('.nav-overlay');
    const navItems = document.querySelectorAll('.nav-links a');

    if (!menuBtn || !navLinks) return;

    function toggleMenu() {
        menuBtn.classList.toggle('active');
        navLinks.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
    }

    function closeMenu() {
        menuBtn.classList.remove('active');
        navLinks.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    menuBtn.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', closeMenu);

    navItems.forEach(item => {
        item.addEventListener('click', closeMenu);
    });

    // Close menu on resize if open
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            closeMenu();
        }
    });
}

// Disable horizontal scroll on mobile
function isMobile() {
    return window.innerWidth <= 768;
}

// Visit Estimator
function initEstimator() {
    const checkboxes = document.querySelectorAll('.service-checkbox input');
    const durationSelect = document.getElementById('duration');
    const resultEmpty = document.getElementById('result-empty');
    const resultContent = document.getElementById('result-content');
    const visitTypeValue = document.getElementById('visit-type-value');
    const visitTypeLocation = document.getElementById('visit-type-location');
    const inPersonNotice = document.getElementById('in-person-notice');
    const travelFeeLine = document.getElementById('travel-fee-line');
    const consultationFee = document.getElementById('consultation-fee');
    const totalPrice = document.getElementById('total-price');
    const durationSuggestion = document.getElementById('duration-suggestion');

    if (!checkboxes.length) return;

    // Pricing: $75 for first 30 min, $50 per additional 30 min, $100 travel fee
    const FIRST_30_MIN = 75;
    const ADDITIONAL_30_MIN = 50;
    const TRAVEL_FEE = 100;

    function calculateConsultationFee(duration) {
        if (duration <= 30) return FIRST_30_MIN;
        const additionalBlocks = (duration - 30) / 30;
        return FIRST_30_MIN + (additionalBlocks * ADDITIONAL_30_MIN);
    }

    function calculateEstimate() {
        const selectedServices = document.querySelectorAll('.service-checkbox input:checked');

        if (selectedServices.length === 0) {
            resultEmpty.style.display = 'block';
            resultContent.style.display = 'none';
            return;
        }

        resultEmpty.style.display = 'none';
        resultContent.style.display = 'block';

        // Check if any in-person services are selected
        let requiresInPerson = false;
        let totalTime = 0;

        selectedServices.forEach(service => {
            if (service.dataset.type === 'in-person') {
                requiresInPerson = true;
            }
            totalTime += parseInt(service.dataset.time) || 0;
        });

        // Update visit type
        if (requiresInPerson) {
            visitTypeValue.textContent = 'In-Person Visit';
            visitTypeLocation.textContent = 'Greater Cleveland Area';
            inPersonNotice.style.display = 'block';
            travelFeeLine.style.display = 'flex';
        } else {
            visitTypeValue.textContent = 'Virtual Visit';
            visitTypeLocation.textContent = 'Anywhere in Ohio';
            inPersonNotice.style.display = 'none';
            travelFeeLine.style.display = 'none';
        }

        // Suggest duration based on selected services
        let suggestedDuration = 30;
        if (totalTime > 90) {
            suggestedDuration = 120;
        } else if (totalTime > 60) {
            suggestedDuration = 90;
        } else if (totalTime > 30) {
            suggestedDuration = 60;
        }

        // Update suggestion text
        if (totalTime > 30) {
            durationSuggestion.textContent = `Based on your selections, we recommend ${suggestedDuration === 60 ? '1 hour' : suggestedDuration === 90 ? '1.5 hours' : suggestedDuration === 120 ? '2 hours' : '30 minutes'}`;
        } else {
            durationSuggestion.textContent = '';
        }

        // Calculate price
        const duration = parseInt(durationSelect.value);
        const baseFee = calculateConsultationFee(duration);
        const total = requiresInPerson ? baseFee + TRAVEL_FEE : baseFee;

        consultationFee.textContent = `$${baseFee}`;
        totalPrice.textContent = `$${total}`;
    }

    // Add event listeners
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', calculateEstimate);
    });

    durationSelect.addEventListener('change', calculateEstimate);
}

// Initialize all effects
document.addEventListener('DOMContentLoaded', () => {
    initParallax();
    if (!isMobile()) {
        initHorizontalScroll();
    }
    initScrollAnimations();
    initLayeredParallax();
    initNavbarScroll();
    initMobileMenu();
    initEstimator();
});

// Reinitialize horizontal scroll on resize
window.addEventListener('resize', () => {
    if (!isMobile()) {
        initHorizontalScroll();
    }
});
