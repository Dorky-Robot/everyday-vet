// Load and render service categories from config
// Config is loaded from services-config.js (SERVICES_CONFIG global variable)

// Global pets state
let pets = [];
let currentPetIndex = -1;

// LocalStorage key for persistence
const STORAGE_KEY = 'everydayvet_schedule';

// Save state to localStorage
function saveToStorage(step, customerType) {
    const state = {
        pets: pets,
        currentPetIndex: currentPetIndex,
        currentStep: step !== undefined ? step : (window._currentEstimatorStep || 0),
        customerType: customerType !== undefined ? customerType : (window._currentCustomerType || 'new')
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Could not save to localStorage:', e);
    }
}

// Load state from localStorage
function loadFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const state = JSON.parse(saved);
            pets = state.pets && Array.isArray(state.pets) ? state.pets : [];
            currentPetIndex = state.currentPetIndex ?? (pets.length > 0 ? 0 : -1);
            window._savedEstimatorStep = state.currentStep ?? 0;
            window._savedCustomerType = state.customerType || 'new';
            return true;
        }
    } catch (e) {
        console.warn('Could not load from localStorage:', e);
    }
    return false;
}

// Clear saved state
function clearStorage() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.warn('Could not clear localStorage:', e);
    }
}

// Expose for debugging
window.getPets = () => pets;
window.getCurrentPetIndex = () => currentPetIndex;
window.clearScheduleData = clearStorage;

function loadServicesConfig() {
    if (typeof SERVICES_CONFIG === 'undefined') {
        console.error('SERVICES_CONFIG not found. Make sure services-config.js is loaded.');
        return;
    }
    // Initialize pet management first
    initPetManagement();
}

// Pet Management
function initPetManagement() {
    const addPetBtn = document.getElementById('add-pet-btn');
    const modal = document.getElementById('add-pet-modal');
    const nameInput = document.getElementById('pet-name-input');
    const typeButtons = document.querySelectorAll('.pet-type-btn');
    const cancelBtn = document.getElementById('pet-modal-cancel');
    const addBtn = document.getElementById('pet-modal-add');
    const petTabs = document.getElementById('pet-tabs');

    if (!addPetBtn || !modal) return;

    let selectedType = null;

    // Open modal
    addPetBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        nameInput.value = '';
        selectedType = null;
        typeButtons.forEach(btn => btn.classList.remove('selected'));
        addBtn.disabled = true;
        nameInput.focus();
    });

    // Close modal on cancel
    cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Close modal on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Type selection
    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            typeButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedType = btn.dataset.type;
            updateAddButton();
        });
    });

    // Name input validation
    nameInput.addEventListener('input', updateAddButton);

    function updateAddButton() {
        addBtn.disabled = !nameInput.value.trim() || !selectedType;
    }

    // Add pet
    addBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name || !selectedType) return;

        const pet = {
            id: Date.now(),
            name: name,
            type: selectedType,
            selectedServices: [],
            customConcerns: []
        };

        pets.push(pet);
        modal.style.display = 'none';

        // Select the newly added pet
        selectPet(pets.length - 1);
        renderPetTabs();
        saveToStorage();
    });

    // Load saved state from localStorage
    loadFromStorage();

    // Initial render
    renderPetTabs();
}

function renderPetTabs() {
    const petTabs = document.getElementById('pet-tabs');
    const addPetBtn = document.getElementById('add-pet-btn');
    const servicesSection = document.getElementById('pet-services-section');
    const currentPetNameEl = document.getElementById('current-pet-name');

    if (!petTabs) return;

    // Clear existing tabs (except add button)
    const existingTabs = petTabs.querySelectorAll('.pet-tab');
    existingTabs.forEach(tab => tab.remove());

    // Render pet tabs
    pets.forEach((pet, index) => {
        const tab = document.createElement('button');
        tab.className = `pet-tab${index === currentPetIndex ? ' active' : ''}`;
        tab.innerHTML = `
            <span class="pet-icon"><i class="ph ph${pet.type === 'dog' ? '-dog' : '-cat'}"></i></span>
            <span class="pet-name">${pet.name}</span>
            <span class="remove-pet"><i class="ph ph-x"></i></span>
        `;

        // Handle remove button separately
        const removeBtn = tab.querySelector('.remove-pet');
        removeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removePet(index);
        });

        // Handle tab selection (not on remove button)
        tab.addEventListener('click', (e) => {
            if (!e.target.closest('.remove-pet')) {
                selectPet(index);
            }
        });

        petTabs.insertBefore(tab, addPetBtn);
    });

    // Update services section visibility
    if (pets.length > 0 && currentPetIndex >= 0) {
        servicesSection.style.display = 'block';
        const currentPet = pets[currentPetIndex];
        currentPetNameEl.textContent = currentPet.name;

        // Render services filtered by pet type
        renderServiceCategories(currentPet.type);
        initAccordions();
        initEstimator();

        // Restore selected services for current pet
        restoreSelectedServices();

        // Recalculate after restoring (services were restored after initEstimator ran)
        if (typeof window.recalculateEstimate === 'function') {
            window.recalculateEstimate();
        }
    } else {
        servicesSection.style.display = 'none';
        // Reset estimate display when no pets
        const resultEmpty = document.getElementById('result-empty');
        const resultContent = document.getElementById('result-content');
        if (resultEmpty) resultEmpty.style.display = 'block';
        if (resultContent) resultContent.style.display = 'none';
    }
}

function selectPet(index) {
    // Save current pet's selections before switching
    if (currentPetIndex >= 0 && pets[currentPetIndex]) {
        saveCurrentPetSelections();
    }

    currentPetIndex = index;
    renderPetTabs();
}

function removePet(index) {
    pets.splice(index, 1);

    // Adjust current index if needed
    if (pets.length === 0) {
        currentPetIndex = -1;
    } else if (currentPetIndex >= pets.length) {
        currentPetIndex = pets.length - 1;
    } else if (currentPetIndex > index) {
        currentPetIndex--;
    }

    renderPetTabs();
    saveToStorage();

    // Recalculate estimate after pet is removed
    if (typeof window.recalculateEstimate === 'function') {
        window.recalculateEstimate();
    }
}

function saveCurrentPetSelections() {
    if (currentPetIndex < 0 || !pets[currentPetIndex]) return;

    const selectedCheckboxes = document.querySelectorAll('.service-checkbox input:checked');
    pets[currentPetIndex].selectedServices = Array.from(selectedCheckboxes).map(cb => cb.value);

    // Save custom concerns too
    if (window.getCustomConcerns) {
        pets[currentPetIndex].customConcerns = window.getCustomConcerns();
    }

    // Persist to localStorage
    saveToStorage();
}

function restoreSelectedServices() {
    if (currentPetIndex < 0 || !pets[currentPetIndex]) return;

    const pet = pets[currentPetIndex];
    const checkboxes = document.querySelectorAll('.service-checkbox input');

    checkboxes.forEach(cb => {
        cb.checked = pet.selectedServices.includes(cb.value);
    });

    // Update accordion states
    document.querySelectorAll('.category-accordion').forEach(accordion => {
        updateAccordionState(accordion);
    });
}

function renderCategorySubtitle(category) {
    let icons = '';
    let text = '';

    switch (category.visitType) {
        case 'both':
            icons = '<i class="ph ph-video-camera"></i><i class="ph ph-house"></i>';
            break;
        case 'in-person':
            icons = '<i class="ph ph-house"></i>';
            break;
        case 'search':
            icons = '<i class="ph ph-magnifying-glass"></i>';
            break;
        default:
            icons = '<i class="ph ph-video-camera"></i>';
    }

    if (category.pricingNote) {
        text = category.pricingNote;
    }

    return `<span class="subtitle-icons">${icons}</span>${text ? `<span class="subtitle-text">${text}</span>` : ''}`;
}

function renderServiceCategories(petType) {
    const container = document.getElementById('service-categories-container');
    if (!container || typeof SERVICES_CONFIG === 'undefined') return;

    let html = '';

    SERVICES_CONFIG.categories.forEach(category => {
        const subtitle = renderCategorySubtitle(category);

        if (category.isCustomInput) {
            // Render custom input section
            html += `
                <div class="category-accordion">
                    <button class="category-header" data-category="${category.id}">
                        <span class="category-title">${category.title}</span>
                        <span class="category-subtitle">${subtitle}</span>
                        <span class="category-toggle"><i class="ph ph-plus"></i></span>
                    </button>
                    <div class="selected-chiclets" data-category="${category.id}"></div>
                    <div class="category-content" id="${category.id}-content">
                        <div class="custom-concern-wrapper">
                            <input type="text" id="custom-concern" class="custom-concern-input" placeholder="Type your concern..." autocomplete="off">
                            <div id="autocomplete-list" class="autocomplete-list"></div>
                            <div id="custom-concerns-tags" class="custom-concerns-tags"></div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Filter items by pet type
            const filteredItems = category.items.filter(item => {
                if (!item.petType) return true; // No petType means available for all
                return item.petType === 'both' || item.petType === petType;
            });

            // Only render category if it has items
            if (filteredItems.length > 0) {
                html += `
                    <div class="category-accordion">
                        <button class="category-header" data-category="${category.id}">
                            <span class="category-title">${category.title}</span>
                            <span class="category-subtitle">${subtitle}</span>
                            <span class="category-toggle"><i class="ph ph-plus"></i></span>
                        </button>
                        <div class="selected-chiclets" data-category="${category.id}"></div>
                        <div class="category-content" id="${category.id}-content">
                            ${category.note ? `<p class="category-note">${category.note}</p>` : ''}
                            <div class="service-options">
                                ${filteredItems.map(item => renderServiceItem(item, category)).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    });

    container.innerHTML = html;
}

function renderServiceItem(item, category) {
    const hasPrice = item.cost !== undefined;
    const hasNote = item.note !== undefined;
    const itemType = item.type || category.defaultType;

    return `
        <label class="service-checkbox${hasPrice ? ' has-price' : ''}">
            <input type="checkbox" name="service"
                value="${item.id}"
                data-type="${itemType}"
                data-group="${category.id}"
                data-time="${item.time}"
                data-time-mode="${category.timeMode}"
                ${hasPrice ? `data-cost="${item.cost}"` : ''}>
            <span class="checkbox-custom"></span>
            <span class="checkbox-label">${item.label}</span>
            ${hasPrice ? `<span class="item-price">$${item.cost}</span>` : ''}
            ${hasNote ? `<span class="checkbox-note">${item.note}</span>` : ''}
        </label>
    `;
}

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

// Multi-step Estimator Navigation
function initEstimatorSteps() {
    const wrapper = document.getElementById('estimator-steps-wrapper');
    const stepNav = document.getElementById('step-nav');
    const dots = stepNav?.querySelectorAll('.step-dot');
    const btnNewCustomer = document.getElementById('btn-new-customer');
    const btnExistingCustomer = document.getElementById('btn-existing-customer');
    const newCustomerContent = document.getElementById('new-customer-content');
    const existingCustomerContent = document.getElementById('existing-customer-content');
    const steps = wrapper?.querySelectorAll('.estimator-step');

    if (!wrapper || !dots || !steps) return;

    let currentStep = 0;
    let customerType = 'existing'; // default to existing (most users will be returning)

    // Show specific step
    function showStep(stepIndex) {
        currentStep = stepIndex;
        window._currentEstimatorStep = stepIndex;

        // Update steps visibility
        steps.forEach((step, index) => {
            step.classList.toggle('active', index === stepIndex);
        });

        // Update dots
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === stepIndex);
        });

        // Save step and customer type to localStorage
        saveToStorage(stepIndex, customerType);
    }

    // Show appropriate content for step 1
    function showContentForType(type) {
        customerType = type;
        window._currentCustomerType = type;
        if (type === 'new') {
            newCustomerContent.style.display = 'block';
            existingCustomerContent.style.display = 'none';
        } else {
            newCustomerContent.style.display = 'none';
            existingCustomerContent.style.display = 'grid';
        }
    }

    // Reset form state (clear pets and storage)
    function resetFormState() {
        pets = [];
        currentPetIndex = -1;
        clearStorage();
        renderPetTabs();
    }

    // Dot click navigation
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            // Going back to step 0 resets everything
            if (index === 0) {
                resetFormState();
            }
            showStep(index);
        });
    });

    // Customer type button clicks
    if (btnNewCustomer) {
        btnNewCustomer.addEventListener('click', () => {
            // Clear any existing pet data when choosing "New Customer"
            resetFormState();
            showContentForType('new');
            showStep(1);
        });
    }

    if (btnExistingCustomer) {
        btnExistingCustomer.addEventListener('click', () => {
            showContentForType('existing');
            showStep(1);
        });
    }

    // Initial state - check for saved data
    if (window._savedEstimatorStep !== undefined && window._savedEstimatorStep > 0) {
        // User has a saved step, restore their position
        const savedType = window._savedCustomerType || 'new';
        showContentForType(savedType);
        showStep(window._savedEstimatorStep);
    } else if (pets.length > 0) {
        // Has pets but no saved step, go to services
        showContentForType('existing');
        showStep(1);
    } else {
        // No saved data, start fresh
        showContentForType('new');
        showStep(0);
    }
}

// Category Accordions
function initAccordions() {
    const accordions = document.querySelectorAll('.category-accordion');

    accordions.forEach(accordion => {
        const header = accordion.querySelector('.category-header');
        const checkboxes = accordion.querySelectorAll('input[type="checkbox"]');

        // Toggle accordion on header click
        header.addEventListener('click', () => {
            accordion.classList.toggle('expanded');
        });

        // Update accordion visual state when checkboxes change
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                updateAccordionState(accordion);
            });
        });

        // Initial state check
        updateAccordionState(accordion);
    });
}

function updateAccordionState(accordion) {
    const checkboxes = accordion.querySelectorAll('input[type="checkbox"]:checked');
    if (checkboxes.length > 0) {
        accordion.classList.add('has-selection');
    } else {
        accordion.classList.remove('has-selection');
    }

    // Update chiclets
    updateChiclets(accordion);
}

function updateChiclets(accordion) {
    const chicletsContainer = accordion.querySelector('.selected-chiclets');
    if (!chicletsContainer) return;

    const selectedCheckboxes = accordion.querySelectorAll('input[type="checkbox"]:checked');

    if (selectedCheckboxes.length === 0) {
        chicletsContainer.innerHTML = '';
        return;
    }

    let html = '';
    selectedCheckboxes.forEach(checkbox => {
        const label = checkbox.closest('.service-checkbox')?.querySelector('.checkbox-label')?.textContent || checkbox.value;
        html += `
            <span class="service-chiclet" data-service-id="${checkbox.value}">
                <span class="chiclet-label">${label}</span>
                <span class="chiclet-remove"><i class="ph ph-x"></i></span>
            </span>
        `;
    });

    chicletsContainer.innerHTML = html;

    // Add click handlers to remove chiclets
    chicletsContainer.querySelectorAll('.service-chiclet').forEach(chiclet => {
        chiclet.addEventListener('click', () => {
            const serviceId = chiclet.dataset.serviceId;
            const checkbox = accordion.querySelector(`input[value="${serviceId}"]`);
            if (checkbox) {
                checkbox.checked = false;
                // Trigger change event to update estimate
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });
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
    const itemizedFeeLine = document.getElementById('itemized-fee-line');
    const itemizedFeeEl = document.getElementById('itemized-fee');
    const consultationFee = document.getElementById('consultation-fee');
    const totalPrice = document.getElementById('total-price');

    if (!checkboxes.length || !durationSlider) return;

    // Pricing: $75 for first 30 min, $50 per additional 30 min, $100 travel fee
    const FIRST_30_MIN = 75;
    const ADDITIONAL_30_MIN = 50;
    const TRAVEL_FEE = 100;
    const MAX_VISIT_DURATION = 120; // 2 hours max per visit

    // Service groupings - related topics that overlap
    const serviceGroups = {
        nutrition: ['diet', 'supplements', 'new-pet', 'picky eating', 'weight'],
        behavior: ['behavior', 'anxiety', 'aggression', 'house soiling', 'litter box', 'separation anxiety', 'barking', 'meowing', 'leash reactivity', 'food aggression'],
        skin: ['skin-issues', 'allergy', 'itching', 'scratching', 'hair loss', 'hot spots'],
        gi: ['gi-issues', 'diarrhea', 'vomiting', 'constipation', 'flatulence'],
        respiratory: ['coughing', 'sneezing', 'nasal discharge', 'reverse sneezing'],
        chronic: ['chronic', 'senior', 'diabetes', 'kidney', 'heart disease', 'thyroid', 'arthritis', 'seizure', 'cancer'],
        preventatives: ['preventatives'],
        eyes_ears: ['eye discharge', 'ear odor', 'ear-treatment', 'bad breath'],
        mobility: ['limping', 'stiffness', 'mobility'],
        wellness: ['second-opinion', 'quality-of-life', 'hospice', 'medication questions', 'prescription', 'lab results', 'post-surgery'],
        // In-person procedures - these don't overlap much
        exam: ['exam'],
        vaccines: ['vaccines'],
        labwork: ['labwork', 'fecal'],
        procedures: ['wound-care', 'ear-treatment', 'subq-fluids', 'injection', 'microchip', 'health-cert', 'nail trim', 'anal gland', 'skin scraping', 'abscess', 'suture', 'bandage', 'deworming', 'allergy injection', 'insulin training', 'fluid therapy'],
        euthanasia: ['euthanasia']
    };

    let recommendedDuration = 30;
    let totalEstimatedTime = 0;
    let numberOfVisits = 1;
    let userHasOverridden = false;

    function calculateConsultationFee(duration) {
        if (duration <= 30) return FIRST_30_MIN;
        const additionalBlocks = (duration - 30) / 30;
        return FIRST_30_MIN + (additionalBlocks * ADDITIONAL_30_MIN);
    }

    function getServiceGroup(serviceValue, serviceLabel) {
        const searchTerms = [serviceValue.toLowerCase(), serviceLabel.toLowerCase()];

        for (const [groupName, keywords] of Object.entries(serviceGroups)) {
            for (const term of searchTerms) {
                for (const keyword of keywords) {
                    if (term.includes(keyword) || keyword.includes(term)) {
                        return groupName;
                    }
                }
            }
        }
        return 'other';
    }

    function calculateSmartTime(services, customConcerns) {
        const groupedTimes = {};

        // Group checkbox services
        services.forEach(service => {
            const label = service.closest('.service-checkbox')?.querySelector('.checkbox-label')?.textContent || '';
            const group = getServiceGroup(service.value, label);
            const time = parseInt(service.dataset.time) || 0;

            if (!groupedTimes[group]) {
                groupedTimes[group] = [];
            }
            groupedTimes[group].push(time);
        });

        // Group custom concerns
        customConcerns.forEach(concern => {
            const group = getServiceGroup(concern.label, concern.label);
            const time = concern.time || 0;

            if (!groupedTimes[group]) {
                groupedTimes[group] = [];
            }
            groupedTimes[group].push(time);
        });

        // Calculate total: for each group, take max time + small increment for extras
        let totalTime = 0;
        for (const [group, times] of Object.entries(groupedTimes)) {
            if (times.length === 0) continue;

            // Sort descending to get max first
            times.sort((a, b) => b - a);

            // Take the max time
            const maxTime = times[0];

            // Add small increment (5 min) for each additional item in same group (up to 10 min extra)
            const extraItems = Math.min(times.length - 1, 2);
            const extraTime = extraItems * 5;

            totalTime += maxTime + extraTime;
        }

        // Minimum 30 minutes
        return Math.max(30, totalTime);
    }

    // Calculate time for a single pet based on stored service IDs
    function calculatePetTime(pet) {
        if (!pet.selectedServices || pet.selectedServices.length === 0) {
            // Check custom concerns
            if (!pet.customConcerns || pet.customConcerns.length === 0) {
                return 0;
            }
        }

        const groupedTimes = {};

        // Get service times from config
        pet.selectedServices.forEach(serviceId => {
            // Find the service in config
            let serviceTime = 10; // default
            let serviceLabel = serviceId;

            for (const category of SERVICES_CONFIG.categories) {
                if (category.items) {
                    const item = category.items.find(i => i.id === serviceId);
                    if (item) {
                        serviceTime = item.time || 10;
                        serviceLabel = item.label || serviceId;
                        break;
                    }
                }
            }

            const group = getServiceGroup(serviceId, serviceLabel);
            if (!groupedTimes[group]) {
                groupedTimes[group] = [];
            }
            groupedTimes[group].push(serviceTime);
        });

        // Add custom concerns
        if (pet.customConcerns) {
            pet.customConcerns.forEach(concern => {
                const group = getServiceGroup(concern.label, concern.label);
                const time = concern.time || 10;

                if (!groupedTimes[group]) {
                    groupedTimes[group] = [];
                }
                groupedTimes[group].push(time);
            });
        }

        // Calculate total with smart grouping
        let totalTime = 0;
        for (const [group, times] of Object.entries(groupedTimes)) {
            if (times.length === 0) continue;
            times.sort((a, b) => b - a);
            const maxTime = times[0];
            const extraItems = Math.min(times.length - 1, 2);
            const extraTime = extraItems * 5;
            totalTime += maxTime + extraTime;
        }

        return totalTime;
    }

    // Calculate total time across all pets
    function calculateTotalTimeAllPets() {
        if (pets.length === 0) {
            // Fall back to DOM selection for single-pet mode
            const selectedServices = document.querySelectorAll('.service-checkbox input:checked');
            const customConcerns = window.getCustomConcerns ? window.getCustomConcerns() : [];
            return calculateSmartTime(selectedServices, customConcerns);
        }

        let totalTime = 0;
        pets.forEach(pet => {
            totalTime += calculatePetTime(pet);
        });

        return Math.max(30, totalTime);
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

    function calculateItemizedCosts() {
        const selectedServices = document.querySelectorAll('.service-checkbox input:checked[data-cost]');
        let itemizedTotal = 0;

        selectedServices.forEach(service => {
            const cost = parseInt(service.dataset.cost) || 0;
            itemizedTotal += cost;
        });

        return itemizedTotal;
    }

    function updatePrice() {
        // For multi-pet visits, calculate across all pets
        if (pets.length > 0) {
            calculateMultiPetPrice();
            return;
        }

        // Single pet / legacy calculation
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

        // Calculate itemized costs (vaccines, labs, procedures)
        const itemizedCosts = calculateItemizedCosts();

        // Calculate total based on number of visits
        const totalConsultationFees = perVisitFee * numberOfVisits;
        const totalTravelFees = perVisitTravel * numberOfVisits;
        const total = totalConsultationFees + totalTravelFees + itemizedCosts;

        // Show/hide itemized costs line
        if (itemizedCosts > 0) {
            itemizedFeeLine.style.display = 'flex';
            itemizedFeeEl.textContent = `$${itemizedCosts}`;
        } else {
            itemizedFeeLine.style.display = 'none';
        }

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

    // Multi-pet pricing calculation
    function calculateMultiPetPrice() {
        const petBreakdown = document.getElementById('pet-breakdown');

        let totalConsultationFees = 0;
        let totalItemizedCosts = 0;
        let requiresInPerson = false;
        let petsWithServices = 0;

        const duration = parseInt(durationSlider.value);
        const perPetFee = calculateConsultationFee(duration);

        let breakdownHtml = '';

        pets.forEach(pet => {
            const petItemizedCost = calculatePetItemizedCosts(pet);
            const hasServices = pet.selectedServices.length > 0 || pet.customConcerns.length > 0;

            if (hasServices) {
                petsWithServices++;
                totalConsultationFees += perPetFee;
                totalItemizedCosts += petItemizedCost;

                // Check if this pet requires in-person
                const petRequiresInPerson = checkPetRequiresInPerson(pet);
                if (petRequiresInPerson) {
                    requiresInPerson = true;
                }

                breakdownHtml += `
                    <div class="pet-breakdown-item">
                        <span class="pet-breakdown-name">
                            <span class="pet-icon"><i class="ph ph${pet.type === 'dog' ? '-dog' : '-cat'}"></i></span>
                            ${pet.name}
                        </span>
                        <span class="pet-breakdown-fee">$${perPetFee}${petItemizedCost > 0 ? ` + $${petItemizedCost}` : ''}</span>
                    </div>
                `;
            }
        });

        // Update visit type
        if (requiresInPerson) {
            visitTypeValue.textContent = 'In-Person Visit';
            visitTypeLocation.textContent = 'Greater Cleveland Area';
            inPersonNotice.style.display = 'block';
            travelFeeLine.style.display = 'flex';
            travelFeeEl.textContent = `$${TRAVEL_FEE}`;
        } else {
            visitTypeValue.textContent = 'Virtual Visit';
            visitTypeLocation.textContent = 'Anywhere in Ohio';
            inPersonNotice.style.display = 'none';
            travelFeeLine.style.display = 'none';
        }

        // Show pet breakdown if multiple pets have services
        if (petsWithServices > 1) {
            petBreakdown.innerHTML = breakdownHtml;
            petBreakdown.style.display = 'block';
            consultationLabel.textContent = `Consultation fees (${petsWithServices} pets)`;
        } else {
            petBreakdown.style.display = 'none';
            consultationLabel.textContent = 'Consultation fee';
        }

        // Hide multiple visits notice for now (simplify for multi-pet)
        multipleVisitsNotice.style.display = 'none';
        perVisitLabel.style.display = 'none';
        visitsCountLine.style.display = 'none';

        // Show/hide itemized costs line
        if (totalItemizedCosts > 0) {
            itemizedFeeLine.style.display = 'flex';
            itemizedFeeEl.textContent = `$${totalItemizedCosts}`;
        } else {
            itemizedFeeLine.style.display = 'none';
        }

        // Calculate total - travel fee is charged ONCE, not per pet
        const travelFee = requiresInPerson ? TRAVEL_FEE : 0;
        const total = totalConsultationFees + travelFee + totalItemizedCosts;

        consultationFee.textContent = `$${totalConsultationFees}`;
        totalPrice.textContent = `$${total}`;
    }

    // Calculate itemized costs for a specific pet
    function calculatePetItemizedCosts(pet) {
        let itemizedTotal = 0;

        pet.selectedServices.forEach(serviceId => {
            // Find the service in config to get its cost
            for (const category of SERVICES_CONFIG.categories) {
                if (category.items) {
                    const item = category.items.find(i => i.id === serviceId);
                    if (item && item.cost) {
                        itemizedTotal += item.cost;
                        break;
                    }
                }
            }
        });

        return itemizedTotal;
    }

    // Check if a pet's services require in-person visit
    function checkPetRequiresInPerson(pet) {
        for (const serviceId of pet.selectedServices) {
            for (const category of SERVICES_CONFIG.categories) {
                if (category.items) {
                    const item = category.items.find(i => i.id === serviceId);
                    if (item) {
                        const itemType = item.type || category.defaultType;
                        if (itemType === 'in-person') {
                            return true;
                        }
                    }
                }
            }
        }

        // Check custom concerns
        for (const concern of pet.customConcerns) {
            if (concern.type === 'in-person') {
                return true;
            }
        }

        return false;
    }

    function calculateEstimate() {
        const selectedServices = document.querySelectorAll('.service-checkbox input:checked');
        const customConcerns = window.getCustomConcerns ? window.getCustomConcerns() : [];

        // For multi-pet, check if ANY pet has selections
        let hasSelections = selectedServices.length > 0 || customConcerns.length > 0;

        if (pets.length > 0) {
            hasSelections = pets.some(pet =>
                pet.selectedServices.length > 0 || pet.customConcerns.length > 0
            );
        }

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

        // Check if any in-person services are selected (across ALL pets)
        let requiresInPerson = false;

        if (pets.length > 0) {
            // Check all pets for in-person services
            requiresInPerson = pets.some(pet => checkPetRequiresInPerson(pet));
        } else {
            // Single pet mode - check DOM
            selectedServices.forEach(service => {
                if (service.dataset.type === 'in-person') {
                    requiresInPerson = true;
                }
            });
            customConcerns.forEach(concern => {
                if (concern.type === 'in-person') {
                    requiresInPerson = true;
                }
            });
        }

        // Use total time calculation across ALL pets
        const totalTime = calculateTotalTimeAllPets();
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
            // Save current pet's selections when checkbox changes
            saveCurrentPetSelections();
            calculateEstimate();
        });
    });

    durationSlider.addEventListener('input', () => {
        userHasOverridden = true;
        updateSliderDisplay();
    });

    // Custom concern autocomplete
    initCustomConcernAutocomplete(calculateEstimate);

    // Expose calculateEstimate globally so it can be called when pets change
    window.recalculateEstimate = calculateEstimate;
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
                    <button class="concern-tag-remove" data-label="${c.label}"><i class="ph ph-x"></i></button>
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
    // Load saved state BEFORE initializing steps so we can restore position
    loadFromStorage();
    initEstimatorSteps();
    // Load services config (this will call initAccordions and initEstimator after rendering)
    loadServicesConfig();
});

// Reinitialize horizontal scroll on resize
window.addEventListener('resize', () => {
    if (!isMobile()) {
        initHorizontalScroll();
    }
});
