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
    const durationSlider = document.getElementById('duration-slider');
    const durationDisplay = document.getElementById('duration-display');
    const durationWarning = document.getElementById('duration-warning');
    const resultEmpty = document.getElementById('result-empty');
    const resultContent = document.getElementById('result-content');
    const visitTypeValue = document.getElementById('visit-type-value');
    const visitTypeLocation = document.getElementById('visit-type-location');
    const inPersonNotice = document.getElementById('in-person-notice');
    const multipleVisitsNotice = document.getElementById('multiple-visits-notice');
    const multipleVisitsText = document.getElementById('multiple-visits-text');
    const perVisitLabel = document.getElementById('per-visit-label');
    const visitsCountLine = document.getElementById('visits-count-line');
    const visitsCount = document.getElementById('visits-count');
    const consultationLabel = document.getElementById('consultation-label');
    const travelFeeLine = document.getElementById('travel-fee-line');
    const travelLabel = document.getElementById('travel-label');
    const travelFeeEl = document.getElementById('travel-fee');
    const consultationFee = document.getElementById('consultation-fee');
    const totalPrice = document.getElementById('total-price');

    if (!checkboxes.length || !durationSlider) return;

    // Pricing: $75 for first 30 min, $50 per additional 30 min, $100 travel fee
    const FIRST_30_MIN = 75;
    const ADDITIONAL_30_MIN = 50;
    const TRAVEL_FEE = 100;
    const MAX_VISIT_DURATION = 120; // 2 hours max per visit

    let recommendedDuration = 30;
    let totalEstimatedTime = 0;
    let numberOfVisits = 1;
    let userHasOverridden = false;

    function calculateConsultationFee(duration) {
        if (duration <= 30) return FIRST_30_MIN;
        const additionalBlocks = (duration - 30) / 30;
        return FIRST_30_MIN + (additionalBlocks * ADDITIONAL_30_MIN);
    }

    function formatDuration(minutes) {
        if (minutes === 30) return '30 minutes';
        if (minutes === 60) return '1 hour';
        if (minutes === 90) return '1.5 hours';
        if (minutes === 120) return '2 hours';
        return `${minutes} minutes`;
    }

    function animateSlider(targetValue) {
        const currentValue = parseInt(durationSlider.value);
        if (currentValue === targetValue) return;

        const step = targetValue > currentValue ? 30 : -30;
        let current = currentValue;

        function animate() {
            current += step;
            durationSlider.value = current;
            updateSliderDisplay();

            if ((step > 0 && current < targetValue) || (step < 0 && current > targetValue)) {
                requestAnimationFrame(animate);
            }
        }

        requestAnimationFrame(animate);
    }

    function updateSliderDisplay() {
        const duration = parseInt(durationSlider.value);
        durationDisplay.textContent = formatDuration(duration);

        // Show warning if below recommended
        if (duration < recommendedDuration) {
            durationWarning.style.display = 'block';
        } else {
            durationWarning.style.display = 'none';
        }

        updatePrice();
    }

    function updatePrice() {
        const selectedServices = document.querySelectorAll('.service-checkbox input:checked');
        const customConcerns = window.getCustomConcerns ? window.getCustomConcerns() : [];

        // Check if any in-person services are selected
        let requiresInPerson = false;
        selectedServices.forEach(service => {
            if (service.dataset.type === 'in-person') {
                requiresInPerson = true;
            }
        });

        // Check custom concerns too
        customConcerns.forEach(concern => {
            if (concern.type === 'in-person') {
                requiresInPerson = true;
            }
        });

        const duration = parseInt(durationSlider.value);
        const perVisitFee = calculateConsultationFee(duration);
        const perVisitTravel = requiresInPerson ? TRAVEL_FEE : 0;

        // Calculate total based on number of visits
        const totalConsultationFees = perVisitFee * numberOfVisits;
        const totalTravelFees = perVisitTravel * numberOfVisits;
        const total = totalConsultationFees + totalTravelFees;

        // Update UI for multiple visits
        if (numberOfVisits > 1) {
            multipleVisitsNotice.style.display = 'block';
            multipleVisitsText.textContent = `Based on your selections, this will likely require ${numberOfVisits} visits.`;
            perVisitLabel.style.display = 'inline';
            visitsCountLine.style.display = 'flex';
            visitsCount.textContent = numberOfVisits;
            consultationLabel.textContent = `Consultation fees (${numberOfVisits} visits)`;
            if (requiresInPerson) {
                travelLabel.textContent = `Travel fees (${numberOfVisits} visits)`;
                travelFeeEl.textContent = `$${totalTravelFees}`;
            }
        } else {
            multipleVisitsNotice.style.display = 'none';
            perVisitLabel.style.display = 'none';
            visitsCountLine.style.display = 'none';
            consultationLabel.textContent = 'Consultation fee';
            travelLabel.textContent = 'Travel fee';
            if (requiresInPerson) {
                travelFeeEl.textContent = `$${TRAVEL_FEE}`;
            }
        }

        consultationFee.textContent = `$${totalConsultationFees}`;
        totalPrice.textContent = `$${total}`;
    }

    function calculateEstimate() {
        const selectedServices = document.querySelectorAll('.service-checkbox input:checked');
        const customConcerns = window.getCustomConcerns ? window.getCustomConcerns() : [];

        const hasSelections = selectedServices.length > 0 || customConcerns.length > 0;

        if (!hasSelections) {
            resultEmpty.style.display = 'block';
            resultContent.style.display = 'none';
            userHasOverridden = false;
            recommendedDuration = 30;
            numberOfVisits = 1;
            totalEstimatedTime = 0;
            durationSlider.value = 30;
            updateSliderDisplay();
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

        // Include custom concerns in calculation
        customConcerns.forEach(concern => {
            if (concern.type === 'in-person') {
                requiresInPerson = true;
            }
            totalTime += concern.time || 0;
        });

        totalEstimatedTime = totalTime;

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

        // Calculate number of visits needed if time exceeds max
        if (totalTime > MAX_VISIT_DURATION) {
            // For multiple visits, recommend 2-hour blocks
            numberOfVisits = Math.ceil(totalTime / MAX_VISIT_DURATION);
            recommendedDuration = MAX_VISIT_DURATION;
        } else {
            numberOfVisits = 1;
            // Calculate recommended duration for single visit
            if (totalTime > 90) {
                recommendedDuration = 120;
            } else if (totalTime > 60) {
                recommendedDuration = 90;
            } else if (totalTime > 30) {
                recommendedDuration = 60;
            } else {
                recommendedDuration = 30;
            }
        }

        // Only auto-adjust slider if user hasn't manually overridden
        if (!userHasOverridden) {
            animateSlider(recommendedDuration);
        } else {
            // Recalculate visits based on user-selected duration
            const userDuration = parseInt(durationSlider.value);
            if (totalTime > userDuration) {
                numberOfVisits = Math.ceil(totalTime / userDuration);
            } else {
                numberOfVisits = 1;
            }
            updateSliderDisplay();
        }

        updatePrice();
    }

    // Add event listeners
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            userHasOverridden = false; // Reset override when services change
            calculateEstimate();
        });
    });

    durationSlider.addEventListener('input', () => {
        userHasOverridden = true;
        updateSliderDisplay();
    });

    // Custom concern autocomplete
    initCustomConcernAutocomplete(calculateEstimate);
}

// Veterinary concerns database
const veterinaryConcerns = [
    // Virtual-eligible concerns
    { label: 'Anxiety or fear issues', type: 'virtual', time: 30 },
    { label: 'Aggression concerns', type: 'virtual', time: 30 },
    { label: 'House soiling / litter box issues', type: 'virtual', time: 25 },
    { label: 'Excessive barking or meowing', type: 'virtual', time: 20 },
    { label: 'Separation anxiety', type: 'virtual', time: 30 },
    { label: 'Leash reactivity', type: 'virtual', time: 25 },
    { label: 'Food aggression', type: 'virtual', time: 25 },
    { label: 'Itching or scratching', type: 'virtual', time: 20 },
    { label: 'Hair loss or bald patches', type: 'virtual', time: 20 },
    { label: 'Hot spots', type: 'virtual', time: 15 },
    { label: 'Ear odor or discharge', type: 'virtual', time: 15 },
    { label: 'Eye discharge or redness', type: 'virtual', time: 15 },
    { label: 'Coughing', type: 'virtual', time: 20 },
    { label: 'Sneezing or nasal discharge', type: 'virtual', time: 15 },
    { label: 'Reverse sneezing', type: 'virtual', time: 15 },
    { label: 'Bad breath', type: 'virtual', time: 15 },
    { label: 'Weight loss concerns', type: 'virtual', time: 20 },
    { label: 'Weight gain / obesity', type: 'virtual', time: 20 },
    { label: 'Increased thirst or urination', type: 'virtual', time: 20 },
    { label: 'Decreased appetite', type: 'virtual', time: 20 },
    { label: 'Picky eating', type: 'virtual', time: 15 },
    { label: 'Constipation', type: 'virtual', time: 15 },
    { label: 'Flatulence', type: 'virtual', time: 15 },
    { label: 'Limping (mild, no trauma)', type: 'virtual', time: 20 },
    { label: 'Stiffness or mobility issues', type: 'virtual', time: 20 },
    { label: 'Arthritis management', type: 'virtual', time: 25 },
    { label: 'Post-surgery follow-up', type: 'virtual', time: 20 },
    { label: 'Medication questions', type: 'virtual', time: 15 },
    { label: 'Prescription refill', type: 'virtual', time: 10 },
    { label: 'Lab results review', type: 'virtual', time: 20 },
    { label: 'Diabetes management', type: 'virtual', time: 25 },
    { label: 'Kidney disease management', type: 'virtual', time: 25 },
    { label: 'Heart disease management', type: 'virtual', time: 25 },
    { label: 'Thyroid disorder management', type: 'virtual', time: 20 },
    { label: 'Seizure management', type: 'virtual', time: 25 },
    { label: 'Cancer supportive care', type: 'virtual', time: 30 },
    { label: 'Hospice care planning', type: 'virtual', time: 30 },
    { label: 'Pet insurance questions', type: 'virtual', time: 15 },
    { label: 'Travel with pets', type: 'virtual', time: 20 },
    { label: 'Introducing new pet', type: 'virtual', time: 20 },
    { label: 'Puppy or kitten care', type: 'virtual', time: 25 },
    { label: 'Lump or bump (assessment)', type: 'virtual', time: 15 },
    { label: 'Scooting or anal gland issues', type: 'virtual', time: 15 },

    // In-person required
    { label: 'Nail trim', type: 'in-person', time: 10 },
    { label: 'Anal gland expression', type: 'in-person', time: 10 },
    { label: 'Skin scraping or cytology', type: 'in-person', time: 15 },
    { label: 'Abscess drainage', type: 'in-person', time: 25 },
    { label: 'Suture or staple removal', type: 'in-person', time: 15 },
    { label: 'Bandage change', type: 'in-person', time: 15 },
    { label: 'Fecal sample collection', type: 'in-person', time: 10 },
    { label: 'Deworming treatment', type: 'in-person', time: 10 },
    { label: 'Allergy injection', type: 'in-person', time: 15 },
    { label: 'Insulin training', type: 'in-person', time: 30 },
    { label: 'Fluid therapy training', type: 'in-person', time: 30 },

    // Not available at mobile practice
    { label: 'Dental cleaning', type: 'unavailable', time: 0, note: 'Requires anesthesia equipment - referral needed' },
    { label: 'Tooth extraction', type: 'unavailable', time: 0, note: 'Requires anesthesia equipment - referral needed' },
    { label: 'Spay surgery', type: 'unavailable', time: 0, note: 'Surgical procedure - referral needed' },
    { label: 'Neuter surgery', type: 'unavailable', time: 0, note: 'Surgical procedure - referral needed' },
    { label: 'Mass removal', type: 'unavailable', time: 0, note: 'Surgical procedure - referral needed' },
    { label: 'X-rays / radiographs', type: 'unavailable', time: 0, note: 'Requires imaging equipment - referral needed' },
    { label: 'Ultrasound', type: 'unavailable', time: 0, note: 'Requires imaging equipment - referral needed' },
    { label: 'Emergency care', type: 'unavailable', time: 0, note: 'Please contact 24/7 emergency hospital' },
    { label: 'Hospitalization', type: 'unavailable', time: 0, note: 'No facility for overnight care - referral needed' },
    { label: 'Blood transfusion', type: 'unavailable', time: 0, note: 'Requires hospital setting - referral needed' },
    { label: 'Orthopedic surgery', type: 'unavailable', time: 0, note: 'Specialist referral needed' },
    { label: 'ACL / cruciate repair', type: 'unavailable', time: 0, note: 'Specialist referral needed' },
    { label: 'Fracture repair', type: 'unavailable', time: 0, note: 'Specialist referral needed' },
    { label: 'Eye surgery', type: 'unavailable', time: 0, note: 'Specialist referral needed' },
    { label: 'Endoscopy', type: 'unavailable', time: 0, note: 'Requires specialized equipment - referral needed' },
    { label: 'CT scan or MRI', type: 'unavailable', time: 0, note: 'Requires imaging facility - referral needed' },
];

function initCustomConcernAutocomplete(onChangeCallback) {
    const input = document.getElementById('custom-concern');
    const list = document.getElementById('autocomplete-list');
    const tagsContainer = document.getElementById('custom-concerns-tags');

    if (!input || !list || !tagsContainer) return;

    let selectedConcerns = [];
    let highlightedIndex = -1;

    function filterConcerns(query) {
        if (!query) return [];
        const lowerQuery = query.toLowerCase();
        return veterinaryConcerns.filter(c =>
            c.label.toLowerCase().includes(lowerQuery)
        ).slice(0, 8);
    }

    function renderList(concerns) {
        if (concerns.length === 0) {
            list.classList.remove('active');
            return;
        }

        list.innerHTML = concerns.map((c, i) => {
            const typeLabel = c.type === 'virtual' ? 'Can discuss virtually' :
                             c.type === 'in-person' ? 'Requires in-person visit' :
                             c.note || 'Not available';
            const unavailableClass = c.type === 'unavailable' ? 'autocomplete-item-unavailable' : '';

            return `
                <div class="autocomplete-item ${unavailableClass}" data-index="${i}">
                    <div class="autocomplete-item-label">${c.label}</div>
                    <div class="autocomplete-item-type">${typeLabel}</div>
                </div>
            `;
        }).join('');

        list.classList.add('active');
        highlightedIndex = -1;
    }

    function selectConcern(concern) {
        if (selectedConcerns.find(c => c.label === concern.label)) return;

        selectedConcerns.push(concern);
        renderTags();
        input.value = '';
        list.classList.remove('active');
        onChangeCallback();
    }

    function removeConcern(label) {
        selectedConcerns = selectedConcerns.filter(c => c.label !== label);
        renderTags();
        onChangeCallback();
    }

    function renderTags() {
        tagsContainer.innerHTML = selectedConcerns.map(c => {
            const tagClass = c.type === 'in-person' ? 'in-person' :
                            c.type === 'unavailable' ? 'unavailable' : '';
            return `
                <span class="concern-tag ${tagClass}" data-label="${c.label}" data-type="${c.type}" data-time="${c.time}">
                    ${c.label}
                    <button class="concern-tag-remove" data-label="${c.label}">&times;</button>
                </span>
            `;
        }).join('');

        // Add remove event listeners
        tagsContainer.querySelectorAll('.concern-tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeConcern(btn.dataset.label);
            });
        });
    }

    // Get custom concerns for estimate calculation
    window.getCustomConcerns = function() {
        return selectedConcerns;
    };

    input.addEventListener('input', () => {
        const filtered = filterConcerns(input.value);
        renderList(filtered);
    });

    input.addEventListener('keydown', (e) => {
        const items = list.querySelectorAll('.autocomplete-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
            items.forEach((item, i) => item.classList.toggle('highlighted', i === highlightedIndex));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, 0);
            items.forEach((item, i) => item.classList.toggle('highlighted', i === highlightedIndex));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && items[highlightedIndex]) {
                const filtered = filterConcerns(input.value);
                selectConcern(filtered[highlightedIndex]);
            }
        } else if (e.key === 'Escape') {
            list.classList.remove('active');
        }
    });

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (item) {
            const filtered = filterConcerns(input.value);
            selectConcern(filtered[parseInt(item.dataset.index)]);
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-concern-wrapper')) {
            list.classList.remove('active');
        }
    });
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
