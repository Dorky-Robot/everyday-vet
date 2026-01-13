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
            customConcerns: [],
            adviceTopics: [],
            adviceContext: ''
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

    const selectedCheckboxes = document.querySelectorAll('.service-checkbox input:checked, .single-toggle-checkbox input:checked, .single-toggle-checkbox input:checked');
    pets[currentPetIndex].selectedServices = Array.from(selectedCheckboxes).map(cb => cb.value);

    // Save custom concerns too
    if (window.getCustomConcerns) {
        pets[currentPetIndex].customConcerns = window.getCustomConcerns();
    }

    // Save advice topics and context for each topic selector category
    SERVICES_CONFIG.categories.forEach(category => {
        if (category.isTopicSelector) {
            const getTopics = window[`getAdviceTopics_${category.id}`];
            const getContext = window[`getAdviceContext_${category.id}`];
            if (getTopics) {
                pets[currentPetIndex][`${category.id}Topics`] = getTopics();
            }
            if (getContext) {
                pets[currentPetIndex][`${category.id}Context`] = getContext();
            }
        }
    });

    // Persist to localStorage
    saveToStorage();
}

function restoreSelectedServices() {
    if (currentPetIndex < 0 || !pets[currentPetIndex]) return;

    const pet = pets[currentPetIndex];
    const checkboxes = document.querySelectorAll('.service-checkbox input, .single-toggle-checkbox input');

    checkboxes.forEach(cb => {
        cb.checked = pet.selectedServices.includes(cb.value);
    });

    // Restore custom concerns
    if (window.setCustomConcerns && pet.customConcerns) {
        window.setCustomConcerns(pet.customConcerns);
    }

    // Restore advice topics and context for each topic selector category
    SERVICES_CONFIG.categories.forEach(category => {
        if (category.isTopicSelector) {
            const setTopics = window[`setAdviceTopics_${category.id}`];
            const setContext = window[`setAdviceContext_${category.id}`];
            if (setTopics) {
                setTopics(pet[`${category.id}Topics`] || []);
            }
            if (setContext) {
                setContext(pet[`${category.id}Context`] || '');
            }
        }
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

        if (category.isTopicSelector) {
            // Render topic selector with autocomplete and freeform textarea
            html += `
                <div class="category-accordion" data-category="${category.id}">
                    <button class="category-header">
                        <span class="category-title">${category.title}</span>
                        <span class="category-subtitle">${subtitle}</span>
                        <span class="category-toggle"><i class="ph ph-plus"></i></span>
                    </button>
                    <div class="selected-chiclets" data-category="${category.id}"></div>
                    <div class="category-content" id="${category.id}-content">
                        ${category.subtitle ? `<p class="category-note">${category.subtitle}</p>` : ''}
                        <div class="topic-selector-wrapper">
                            <div class="topic-input-wrapper">
                                <input type="text" id="topic-input-${category.id}" class="topic-input" placeholder="Search topics or type your own..." autocomplete="off">
                                <div id="topic-autocomplete-${category.id}" class="autocomplete-list"></div>
                            </div>
                            <div id="topic-tags-${category.id}" class="topic-tags"></div>
                        </div>
                        <div class="topic-context-wrapper">
                            <label for="topic-context-${category.id}" class="topic-context-label">Anything else you'd like to share?</label>
                            <textarea id="topic-context-${category.id}" class="topic-context-textarea" placeholder="Feel free to share any additional context that would help the vet prepare for your conversation..."></textarea>
                        </div>
                    </div>
                </div>
            `;
        } else if (category.isCustomInput) {
            // Render custom input section
            html += `
                <div class="category-accordion" data-category="${category.id}">
                    <button class="category-header">
                        <span class="category-title">${category.title}</span>
                        <span class="category-subtitle">${subtitle}</span>
                        <span class="category-toggle"><i class="ph ph-plus"></i></span>
                    </button>
                    <div class="selected-chiclets" data-category="${category.id}"></div>
                    <div class="category-content" id="${category.id}-content">
                        <div class="custom-concern-wrapper">
                            <div class="custom-concern-input-wrapper">
                                <input type="text" id="custom-concern" class="custom-concern-input" placeholder="Type your concern..." autocomplete="off">
                                <div id="autocomplete-list" class="autocomplete-list"></div>
                            </div>
                            <div id="custom-concerns-tags" class="custom-concerns-tags"></div>
                        </div>
                    </div>
                </div>
            `;
        } else if (category.isSingleToggle && category.item) {
            // Render single toggle checkbox (not an accordion)
            const item = category.item;
            html += `
                <div class="category-single-toggle" data-category="${category.id}">
                    <label class="single-toggle-checkbox">
                        <input type="checkbox" name="service"
                            value="${item.id}"
                            data-type="${category.defaultType}"
                            data-group="${category.id}"
                            data-time="${item.time}"
                            data-time-mode="${category.timeMode}">
                        <span class="checkbox-custom"></span>
                        <span class="single-toggle-title">${category.title}</span>
                        <span class="single-toggle-subtitle">${subtitle}</span>
                    </label>
                </div>
            `;
        } else if (category.items) {
            // Filter items by pet type
            const filteredItems = category.items.filter(item => {
                if (!item.petType) return true; // No petType means available for all
                return item.petType === 'both' || item.petType === petType;
            });

            // Only render category if it has items
            if (filteredItems.length > 0) {
                html += `
                    <div class="category-accordion" data-category="${category.id}">
                        <button class="category-header">
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
    const customConcernTags = accordion.querySelectorAll('.concern-tag');
    const topicTags = accordion.querySelectorAll('.topic-tag');
    const contextTextarea = accordion.querySelector('.topic-context-textarea');
    const hasContext = contextTextarea && contextTextarea.value.trim().length > 0;

    if (checkboxes.length > 0 || customConcernTags.length > 0 || topicTags.length > 0 || hasContext) {
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

    const categoryId = accordion.dataset.category;
    const selectedCheckboxes = accordion.querySelectorAll('input[type="checkbox"]:checked');
    const isOtherCategory = categoryId === 'other';
    const isVaccinesCategory = categoryId === 'vaccines';
    const customConcerns = isOtherCategory && window.getCustomConcerns ? window.getCustomConcerns() : [];

    // Get advice topics for topic selector categories
    const getTopics = window[`getAdviceTopics_${categoryId}`];
    const adviceTopics = getTopics ? getTopics() : [];

    if (selectedCheckboxes.length === 0 && customConcerns.length === 0 && adviceTopics.length === 0) {
        chicletsContainer.innerHTML = '';
        return;
    }

    let html = '';

    // For vaccines category, add automatic "Free Quick Exam" chiclet first
    if (isVaccinesCategory && selectedCheckboxes.length > 0) {
        html += `
            <span class="service-chiclet chiclet-free" data-auto="quick-exam" title="A quick examination is included free with vaccinations to ensure your pet is healthy enough to receive them safely.">
                <span class="chiclet-label">Free Quick Exam</span>
            </span>
        `;
    }

    // Checkbox-based chiclets
    selectedCheckboxes.forEach(checkbox => {
        const label = checkbox.closest('.service-checkbox')?.querySelector('.checkbox-label')?.textContent || checkbox.value;
        html += `
            <span class="service-chiclet" data-service-id="${checkbox.value}">
                <span class="chiclet-label">${label}</span>
                <span class="chiclet-remove"><i class="ph ph-x"></i></span>
            </span>
        `;
    });

    // Custom concern chiclets
    customConcerns.forEach(concern => {
        html += `
            <span class="service-chiclet" data-concern-label="${concern.label}">
                <span class="chiclet-label">${concern.label}</span>
                <span class="chiclet-remove"><i class="ph ph-x"></i></span>
            </span>
        `;
    });

    // Advice topic chiclets
    adviceTopics.forEach(topic => {
        html += `
            <span class="service-chiclet" data-topic="${topic}">
                <span class="chiclet-label">${topic}</span>
                <span class="chiclet-remove"><i class="ph ph-x"></i></span>
            </span>
        `;
    });

    chicletsContainer.innerHTML = html;

    // Add click handlers to remove checkbox chiclets
    chicletsContainer.querySelectorAll('.service-chiclet[data-service-id]').forEach(chiclet => {
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

    // Add click handlers to remove custom concern chiclets
    chicletsContainer.querySelectorAll('.service-chiclet[data-concern-label]').forEach(chiclet => {
        chiclet.addEventListener('click', () => {
            const label = chiclet.dataset.concernLabel;
            // Find and click the remove button on the concern tag
            const tagRemoveBtn = accordion.querySelector(`.concern-tag-remove[data-label="${label}"]`);
            if (tagRemoveBtn) {
                tagRemoveBtn.click();
            }
        });
    });

    // Add click handlers to remove advice topic chiclets
    chicletsContainer.querySelectorAll('.service-chiclet[data-topic]').forEach(chiclet => {
        chiclet.addEventListener('click', () => {
            const topic = chiclet.dataset.topic;
            // Find and click the remove button on the topic tag
            const tagRemoveBtn = accordion.querySelector(`.topic-tag-remove[data-topic="${topic}"]`);
            if (tagRemoveBtn) {
                tagRemoveBtn.click();
            }
        });
    });
}

// Smart Appointment Time Estimator
// Understands that many activities overlap or don't accumulate linearly
function estimateAppointmentTime(appointmentData) {
    const { adviceTopics, vaccines, labs, procedures, physicalExam, customConcerns, numPets } = appointmentData;

    let totalMinutes = 0;
    let reasoning = [];

    // Base setup time for any appointment (greeting, getting settled)
    const baseSetupTime = 5;
    totalMinutes += baseSetupTime;

    // ADVICE & DISCUSSION TOPICS
    // These largely overlap - discussing 3 topics vs 6 topics doesn't double the time
    // The vet addresses related concerns together naturally
    if (adviceTopics.length > 0 || customConcerns.length > 0) {
        const totalTopics = adviceTopics.length + customConcerns.length;
        // Base discussion time: 15 min
        // Additional topics add diminishing time: +3 min for topics 2-3, +2 min for 4-6, +1 min beyond
        let discussionTime = 15;
        if (totalTopics > 1) {
            const tier1 = Math.min(totalTopics - 1, 2); // topics 2-3
            const tier2 = Math.min(Math.max(totalTopics - 3, 0), 3); // topics 4-6
            const tier3 = Math.max(totalTopics - 6, 0); // topics 7+
            discussionTime += (tier1 * 3) + (tier2 * 2) + (tier1 * 1);
        }
        totalMinutes += discussionTime;
        reasoning.push(`Discussion: ~${discussionTime} min`);
    }

    // PHYSICAL EXAMINATION
    // Comprehensive exam is thorough; quick exam (for vaccines) is faster
    if (physicalExam === 'comprehensive') {
        totalMinutes += 15;
        reasoning.push('Comprehensive exam: ~15 min');
    } else if (physicalExam === 'quick') {
        totalMinutes += 5;
        reasoning.push('Quick exam: ~5 min');
    }

    // VACCINES
    // The prep is what takes time, not the injections themselves
    // 1 vaccine or 10 vaccines = similar time (prep once, inject quickly)
    if (vaccines.length > 0) {
        // Prep time (drawing up vaccines, organizing): 5 min
        // Actual injections: ~1 min total regardless of count
        const vaccineTime = 6;
        totalMinutes += vaccineTime;
        reasoning.push(`Vaccines (${vaccines.length}): ~${vaccineTime} min`);
    }

    // LAB WORK
    // Each type of sample collection has its own time
    if (labs.length > 0) {
        // Blood draw: 3-5 min, other samples: 2-3 min each
        const labTime = Math.min(labs.length * 4, 12); // Cap at 12 min
        totalMinutes += labTime;
        reasoning.push(`Lab collection: ~${labTime} min`);
    }

    // PROCEDURES
    // Each procedure is somewhat independent but some can be combined
    if (procedures.length > 0) {
        let procedureTime = 0;
        procedures.forEach(proc => {
            // Nail trim: 5-10 min, Anal glands: 5 min, Wound care: 10-20 min, etc.
            const procTime = proc.time || 10;
            procedureTime += procTime;
        });
        // Slight efficiency when doing multiple procedures back-to-back
        if (procedures.length > 1) {
            procedureTime = Math.round(procedureTime * 0.85);
        }
        totalMinutes += procedureTime;
        reasoning.push(`Procedures: ~${procedureTime} min`);
    }

    // MULTIPLE PETS
    // Second pet doesn't double the time - vet is already set up
    // Add ~60-70% of base time for each additional pet
    if (numPets > 1) {
        const additionalPetTime = Math.round((totalMinutes - baseSetupTime) * 0.65 * (numPets - 1));
        totalMinutes += additionalPetTime;
        reasoning.push(`Additional pet(s): ~${additionalPetTime} min`);
    }

    // Round to nearest 5 minutes for cleaner display
    totalMinutes = Math.round(totalMinutes / 5) * 5;

    // Minimum appointment is 15 minutes
    totalMinutes = Math.max(totalMinutes, 15);

    return {
        minutes: totalMinutes,
        formatted: formatDuration(totalMinutes),
        reasoning: reasoning.join(' • ')
    };
}

function formatDuration(minutes) {
    if (minutes < 60) {
        return `${minutes} minutes`;
    } else if (minutes === 60) {
        return '1 hour';
    } else if (minutes < 120) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hour`;
    } else {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours} hrs ${mins} min` : `${hours} hours`;
    }
}

// Gather all appointment data from current selections
function gatherAppointmentData() {
    const data = {
        adviceTopics: [],
        vaccines: [],
        labs: [],
        procedures: [],
        physicalExam: null,
        customConcerns: [],
        numPets: Math.max(pets.length, 1)
    };

    // Get advice topics
    const getAdviceTopics = window['getAdviceTopics_advice'];
    if (getAdviceTopics) {
        data.adviceTopics = getAdviceTopics();
    }

    // Get custom concerns from "Something Else?"
    if (window.getCustomConcerns) {
        data.customConcerns = window.getCustomConcerns();
    }

    // Get selected checkboxes
    const selectedServices = document.querySelectorAll('.service-checkbox input:checked, .single-toggle-checkbox input:checked');
    selectedServices.forEach(service => {
        const group = service.dataset.group;
        const time = parseInt(service.dataset.time) || 10;
        const label = service.closest('.service-checkbox')?.querySelector('.checkbox-label')?.textContent ||
                     service.closest('.single-toggle-checkbox')?.querySelector('.single-toggle-title')?.textContent ||
                     service.value;

        if (group === 'exam') {
            data.physicalExam = 'comprehensive';
        } else if (group === 'vaccines') {
            data.vaccines.push({ id: service.value, label, time });
            // Vaccines require quick exam
            if (!data.physicalExam) {
                data.physicalExam = 'quick';
            }
        } else if (group === 'labs') {
            data.labs.push({ id: service.value, label, time });
        } else if (group === 'procedures' || group === 'special') {
            data.procedures.push({ id: service.value, label, time });
        }
    });

    return data;
}

// Visit Estimator
function initEstimator() {
    const checkboxes = document.querySelectorAll('.service-checkbox input, .single-toggle-checkbox input');
    const durationDisplay = document.getElementById('duration-display');
    const durationReasoning = document.getElementById('duration-reasoning');
    const resultEmpty = document.getElementById('result-empty');
    const resultContent = document.getElementById('result-content');
    const visitTypeValue = document.getElementById('visit-type-value');
    const visitTypeLocation = document.getElementById('visit-type-location');
    const inPersonNotice = document.getElementById('in-person-notice');
    const multipleVisitsNotice = document.getElementById('multiple-visits-notice');
    const multipleVisitsText = document.getElementById('multiple-visits-text');
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

    if (!checkboxes.length) return;

    // Pricing structure:
    // - Advice & Guidance: $75 for first pet + $10 per additional pet in household
    // - Everything else: per line item (transactional)
    // - Travel fee: $100 for in-person visits
    const ADVICE_BASE_FEE = 75;
    const ADVICE_ADDITIONAL_PET_FEE = 10;
    const TRAVEL_FEE = 100;

    let numberOfVisits = 1;

    // Check if any pet has advice/guidance selected
    function hasAnyAdviceSelected() {
        // Check current DOM state
        const getTopics = window['getAdviceTopics_advice'];
        const getContext = window['getAdviceContext_advice'];
        const topics = getTopics ? getTopics() : [];
        const context = getContext ? getContext() : '';

        if (topics.length > 0 || context.trim().length > 0) {
            return true;
        }

        // Check all pets' stored data
        for (const pet of pets) {
            const petTopics = pet.adviceTopics || [];
            const petContext = pet.adviceContext || '';
            if (petTopics.length > 0 || petContext.trim().length > 0) {
                return true;
            }
        }

        return false;
    }

    // Calculate advice & guidance fee based on household size
    function calculateAdviceFee() {
        if (!hasAnyAdviceSelected()) {
            return 0;
        }

        const numPets = Math.max(pets.length, 1);
        // $75 for first pet + $10 per additional pet
        return ADVICE_BASE_FEE + (Math.max(numPets - 1, 0) * ADVICE_ADDITIONAL_PET_FEE);
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
            const selectedServices = document.querySelectorAll('.service-checkbox input:checked, .single-toggle-checkbox input:checked');
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

    function calculateItemizedCosts() {
        const selectedServices = document.querySelectorAll('.service-checkbox input:checked, .single-toggle-checkbox input:checked[data-cost]');
        let itemizedTotal = 0;

        selectedServices.forEach(service => {
            const cost = parseInt(service.dataset.cost) || 0;
            itemizedTotal += cost;
        });

        return itemizedTotal;
    }

    function updatePrice() {
        const selectedServices = document.querySelectorAll('.service-checkbox input:checked, .single-toggle-checkbox input:checked');
        const customConcerns = window.getCustomConcerns ? window.getCustomConcerns() : [];
        const consultationFeeLine = document.getElementById('consultation-fee-line');
        const numPets = Math.max(pets.length, 1);

        // Check if any in-person services are selected
        let requiresInPerson = false;
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

        // Also check pets for in-person services
        if (pets.length > 0) {
            requiresInPerson = requiresInPerson || pets.some(pet => checkPetRequiresInPerson(pet));
        }

        // Calculate advice fee: $75 + $10 per additional pet (if any advice selected)
        const adviceFee = calculateAdviceFee();

        // Calculate itemized costs (vaccines, labs, procedures) for all pets
        let itemizedCosts = calculateItemizedCosts();

        // Add itemized costs from all pets' stored selections
        if (pets.length > 0) {
            pets.forEach(pet => {
                pet.selectedServices.forEach(serviceId => {
                    for (const category of SERVICES_CONFIG.categories) {
                        if (category.items) {
                            const item = category.items.find(i => i.id === serviceId);
                            if (item && item.cost) {
                                itemizedCosts += item.cost;
                            }
                        }
                    }
                });
            });
        }

        // Travel fee for in-person visits
        const travelFee = requiresInPerson ? TRAVEL_FEE : 0;

        // Calculate total
        const total = adviceFee + itemizedCosts + travelFee;

        // Update UI - Advice fee line
        if (adviceFee > 0) {
            if (consultationFeeLine) consultationFeeLine.style.display = 'flex';
            if (numPets > 1) {
                consultationLabel.textContent = `Advice & Guidance (${numPets} pets)`;
            } else {
                consultationLabel.textContent = 'Advice & Guidance';
            }
            consultationFee.textContent = `$${adviceFee}`;
        } else {
            if (consultationFeeLine) consultationFeeLine.style.display = 'none';
        }

        // Update UI - Itemized costs
        if (itemizedCosts > 0) {
            itemizedFeeLine.style.display = 'flex';
            itemizedFeeEl.textContent = `$${itemizedCosts}`;
        } else {
            itemizedFeeLine.style.display = 'none';
        }

        // Update UI - Travel fee
        if (travelFee > 0) {
            travelFeeLine.style.display = 'flex';
            travelFeeEl.textContent = `$${travelFee}`;
        }

        totalPrice.textContent = `$${total}`;
    }

    // Multi-pet pricing calculation
    function calculateMultiPetPrice() {
        const petBreakdown = document.getElementById('pet-breakdown');
        const consultationFeeLine = document.getElementById('consultation-fee-line');

        let totalConsultationFees = 0;
        let totalItemizedCosts = 0;
        let requiresInPerson = false;
        let anyPetRequiresConsultation = false;
        let petsWithServices = 0;
        let petsWithConsultation = 0;

        let breakdownHtml = '';

        pets.forEach(pet => {
            const petItemizedCost = calculatePetItemizedCosts(pet);
            const hasServices = pet.selectedServices.length > 0 || pet.customConcerns.length > 0;
            const petRequiresConsultation = checkPetRequiresConsultation(pet);

            if (hasServices) {
                petsWithServices++;
                totalItemizedCosts += petItemizedCost;

                // Only add consultation fee if this pet needs vet consultation
                // Calculate based on consultation service time, not total time
                let perPetFee = 0;
                if (petRequiresConsultation) {
                    petsWithConsultation++;
                    anyPetRequiresConsultation = true;

                    // Calculate consultation duration based only on consultation services
                    const petConsultTime = calculatePetConsultationTime(pet);
                    // Round up to nearest 30-min block, minimum 30 min
                    const consultDuration = Math.max(30, Math.ceil(petConsultTime / 30) * 30);
                    perPetFee = calculateConsultationFee(consultDuration);
                    totalConsultationFees += perPetFee;
                }

                // Check if this pet requires in-person
                const petRequiresInPerson = checkPetRequiresInPerson(pet);
                if (petRequiresInPerson) {
                    requiresInPerson = true;
                }

                // Show breakdown with consultation fee only if needed
                const feeDisplay = petRequiresConsultation ? `$${perPetFee}` : '';
                const itemizedDisplay = petItemizedCost > 0 ? `$${petItemizedCost}` : '';
                const separator = (feeDisplay && itemizedDisplay) ? ' + ' : '';
                const totalDisplay = feeDisplay + separator + itemizedDisplay;

                if (totalDisplay) {
                    breakdownHtml += `
                        <div class="pet-breakdown-item">
                            <span class="pet-breakdown-name">
                                <span class="pet-icon"><i class="ph ph${pet.type === 'dog' ? '-dog' : '-cat'}"></i></span>
                                ${pet.name}
                            </span>
                            <span class="pet-breakdown-fee">${totalDisplay}</span>
                        </div>
                    `;
                }
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

        // Show/hide consultation fee line based on whether any pet needs consultation
        if (anyPetRequiresConsultation) {
            if (consultationFeeLine) consultationFeeLine.style.display = 'flex';
            // Update label based on number of pets with consultation
            if (petsWithConsultation > 1) {
                consultationLabel.textContent = `Consultation fees (${petsWithConsultation} pets)`;
            } else {
                consultationLabel.textContent = 'Consultation fee';
            }
        } else {
            if (consultationFeeLine) consultationFeeLine.style.display = 'none';
        }

        // Show pet breakdown if multiple pets have services
        if (petsWithServices > 1 && breakdownHtml) {
            petBreakdown.innerHTML = breakdownHtml;
            petBreakdown.style.display = 'block';
        } else {
            petBreakdown.style.display = 'none';
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

    // Check if a pet's services require vet consultation (vs tech-only services)
    function checkPetRequiresConsultation(pet) {
        for (const serviceId of pet.selectedServices) {
            for (const category of SERVICES_CONFIG.categories) {
                if (category.items) {
                    const item = category.items.find(i => i.id === serviceId);
                    if (item && category.requiresConsultation) {
                        return true;
                    }
                }
            }
        }

        // Custom concerns always require consultation (they need vet advice)
        if (pet.customConcerns && pet.customConcerns.length > 0) {
            return true;
        }

        // Check advice topics for topic selector categories
        for (const category of SERVICES_CONFIG.categories) {
            if (category.isTopicSelector && category.requiresConsultation) {
                const topics = pet[`${category.id}Topics`] || [];
                const context = pet[`${category.id}Context`] || '';
                if (topics.length > 0 || context.trim().length > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    // Check if DOM-selected services require consultation (for single pet mode)
    function checkSelectedServicesRequireConsultation() {
        const selectedServices = document.querySelectorAll('.service-checkbox input:checked, .single-toggle-checkbox input:checked');

        for (const service of selectedServices) {
            const group = service.dataset.group;
            const category = SERVICES_CONFIG.categories.find(c => c.id === group);
            if (category && category.requiresConsultation) {
                return true;
            }
        }

        // Custom concerns always require consultation
        const customConcerns = window.getCustomConcerns ? window.getCustomConcerns() : [];
        if (customConcerns.length > 0) {
            return true;
        }

        // Check advice topics for topic selector categories
        for (const category of SERVICES_CONFIG.categories) {
            if (category.isTopicSelector && category.requiresConsultation) {
                const getTopics = window[`getAdviceTopics_${category.id}`];
                const getContext = window[`getAdviceContext_${category.id}`];
                const topics = getTopics ? getTopics() : [];
                const context = getContext ? getContext() : '';
                if (topics.length > 0 || context.trim().length > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    // Calculate time ONLY from consultation services (for consultation fee)
    function calculatePetConsultationTime(pet) {
        let totalTime = 0;

        pet.selectedServices.forEach(serviceId => {
            for (const category of SERVICES_CONFIG.categories) {
                if (category.items && category.requiresConsultation) {
                    const item = category.items.find(i => i.id === serviceId);
                    if (item) {
                        totalTime += item.time || 10;
                    }
                }
            }
        });

        // Custom concerns count as consultation time
        if (pet.customConcerns) {
            pet.customConcerns.forEach(concern => {
                totalTime += concern.time || 10;
            });
        }

        // Advice topics count as consultation time (base 30 min + 5 min per additional topic)
        for (const category of SERVICES_CONFIG.categories) {
            if (category.isTopicSelector && category.requiresConsultation) {
                const topics = pet[`${category.id}Topics`] || [];
                const context = pet[`${category.id}Context`] || '';
                if (topics.length > 0 || context.trim().length > 0) {
                    // Base time for advice consultation
                    totalTime += 30;
                    // Add small increment for multiple topics (up to 15 min extra)
                    const extraTopics = Math.min(topics.length - 1, 3);
                    if (extraTopics > 0) {
                        totalTime += extraTopics * 5;
                    }
                }
            }
        }

        return totalTime;
    }

    // Calculate total consultation time across all pets
    function calculateTotalConsultationTime() {
        if (pets.length === 0) {
            // Single pet mode - check DOM
            const selectedServices = document.querySelectorAll('.service-checkbox input:checked, .single-toggle-checkbox input:checked');
            let totalTime = 0;

            selectedServices.forEach(service => {
                const group = service.dataset.group;
                const category = SERVICES_CONFIG.categories.find(c => c.id === group);
                if (category && category.requiresConsultation) {
                    totalTime += parseInt(service.dataset.time) || 10;
                }
            });

            // Add custom concerns time
            const customConcerns = window.getCustomConcerns ? window.getCustomConcerns() : [];
            customConcerns.forEach(concern => {
                totalTime += concern.time || 10;
            });

            // Add advice topics time
            for (const category of SERVICES_CONFIG.categories) {
                if (category.isTopicSelector && category.requiresConsultation) {
                    const getTopics = window[`getAdviceTopics_${category.id}`];
                    const getContext = window[`getAdviceContext_${category.id}`];
                    const topics = getTopics ? getTopics() : [];
                    const context = getContext ? getContext() : '';
                    if (topics.length > 0 || context.trim().length > 0) {
                        // Base time for advice consultation
                        totalTime += 30;
                        // Add small increment for multiple topics
                        const extraTopics = Math.min(topics.length - 1, 3);
                        if (extraTopics > 0) {
                            totalTime += extraTopics * 5;
                        }
                    }
                }
            }

            return Math.max(0, totalTime);
        }

        let totalTime = 0;
        pets.forEach(pet => {
            totalTime += calculatePetConsultationTime(pet);
        });

        return totalTime;
    }

    function calculateEstimate() {
        const selectedServices = document.querySelectorAll('.service-checkbox input:checked, .single-toggle-checkbox input:checked');
        const customConcerns = window.getCustomConcerns ? window.getCustomConcerns() : [];

        // For multi-pet, check if ANY pet has selections
        let hasSelections = selectedServices.length > 0 || customConcerns.length > 0;

        // Check advice topics in DOM (for single pet mode)
        for (const category of SERVICES_CONFIG.categories) {
            if (category.isTopicSelector) {
                const getTopics = window[`getAdviceTopics_${category.id}`];
                const getContext = window[`getAdviceContext_${category.id}`];
                const topics = getTopics ? getTopics() : [];
                const context = getContext ? getContext() : '';
                if (topics.length > 0 || context.trim().length > 0) {
                    hasSelections = true;
                    break;
                }
            }
        }

        if (pets.length > 0) {
            hasSelections = pets.some(pet => {
                if (pet.selectedServices.length > 0 || pet.customConcerns.length > 0) {
                    return true;
                }
                // Check advice topics for this pet
                for (const category of SERVICES_CONFIG.categories) {
                    if (category.isTopicSelector) {
                        const topics = pet[`${category.id}Topics`] || [];
                        const context = pet[`${category.id}Context`] || '';
                        if (topics.length > 0 || context.trim().length > 0) {
                            return true;
                        }
                    }
                }
                return false;
            });
        }

        if (!hasSelections) {
            resultEmpty.style.display = 'block';
            resultContent.style.display = 'none';
            durationDisplay.textContent = '—';
            if (durationReasoning) durationReasoning.textContent = '';
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

        // Use smart time estimation
        const appointmentData = gatherAppointmentData();
        const timeEstimate = estimateAppointmentTime(appointmentData);

        // Update duration display
        durationDisplay.textContent = timeEstimate.formatted;
        if (durationReasoning && timeEstimate.reasoning) {
            durationReasoning.textContent = timeEstimate.reasoning;
            durationReasoning.style.display = 'block';
        } else if (durationReasoning) {
            durationReasoning.style.display = 'none';
        }

        // Check if multiple visits needed (over 2 hours)
        const MAX_VISIT_DURATION = 120;
        if (timeEstimate.minutes > MAX_VISIT_DURATION) {
            numberOfVisits = Math.ceil(timeEstimate.minutes / MAX_VISIT_DURATION);
            multipleVisitsNotice.style.display = 'block';
            multipleVisitsText.textContent = `This may require ${numberOfVisits} visits to complete thoroughly.`;
            visitsCountLine.style.display = 'flex';
            visitsCount.textContent = numberOfVisits;
        } else {
            numberOfVisits = 1;
            multipleVisitsNotice.style.display = 'none';
            visitsCountLine.style.display = 'none';
        }

        updatePrice();
    }

    // Add event listeners
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            // Save current pet's selections when checkbox changes
            saveCurrentPetSelections();
            calculateEstimate();
        });
    });

    // Custom concern autocomplete
    initCustomConcernAutocomplete(calculateEstimate);

    // Initialize topic selectors for isTopicSelector categories
    SERVICES_CONFIG.categories.forEach(category => {
        if (category.isTopicSelector && category.topics) {
            initTopicSelectorAutocomplete(category.id, category.topics, calculateEstimate);
        }
    });

    // Expose calculateEstimate globally so it can be called when pets change
    window.recalculateEstimate = calculateEstimate;
}

// Veterinary concerns database - physical symptoms and specific procedures
// (Advice/guidance topics are in the Advice & Guidance section)
const veterinaryConcerns = [
    // Physical symptoms (can discuss virtually)
    { label: 'Itching or scratching', type: 'virtual', time: 20 },
    { label: 'Hair loss or bald patches', type: 'virtual', time: 20 },
    { label: 'Hot spots', type: 'virtual', time: 15 },
    { label: 'Ear odor or discharge', type: 'virtual', time: 15 },
    { label: 'Eye discharge or redness', type: 'virtual', time: 15 },
    { label: 'Coughing', type: 'virtual', time: 20 },
    { label: 'Sneezing or nasal discharge', type: 'virtual', time: 15 },
    { label: 'Reverse sneezing', type: 'virtual', time: 15 },
    { label: 'Bad breath', type: 'virtual', time: 15 },
    { label: 'Vomiting', type: 'virtual', time: 20 },
    { label: 'Diarrhea', type: 'virtual', time: 20 },
    { label: 'Constipation', type: 'virtual', time: 15 },
    { label: 'Flatulence', type: 'virtual', time: 15 },
    { label: 'Increased thirst or urination', type: 'virtual', time: 20 },
    { label: 'Decreased appetite', type: 'virtual', time: 20 },
    { label: 'Limping (mild, no trauma)', type: 'virtual', time: 20 },
    { label: 'Stiffness or mobility issues', type: 'virtual', time: 20 },
    { label: 'Lump or bump (assessment)', type: 'virtual', time: 15 },
    { label: 'Scooting or anal gland issues', type: 'virtual', time: 15 },
    { label: 'Excessive shedding', type: 'virtual', time: 15 },
    { label: 'Skin rash or redness', type: 'virtual', time: 15 },

    // In-person procedures
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
        saveCurrentPetSelections();
        // Update accordion state for chiclets
        const accordion = input.closest('.category-accordion');
        if (accordion) updateAccordionState(accordion);
        onChangeCallback();
    }

    function removeConcern(label) {
        selectedConcerns = selectedConcerns.filter(c => c.label !== label);
        renderTags();
        saveCurrentPetSelections();
        // Update accordion state for chiclets
        const accordion = input.closest('.category-accordion');
        if (accordion) updateAccordionState(accordion);
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

    // Set custom concerns (for restoring from saved state)
    window.setCustomConcerns = function(concerns) {
        selectedConcerns = concerns || [];
        renderTags();
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
            const filtered = filterConcerns(input.value);
            if (highlightedIndex >= 0 && items[highlightedIndex]) {
                // Select highlighted autocomplete item
                selectConcern(filtered[highlightedIndex]);
            } else if (input.value.trim()) {
                // No autocomplete match - add as freeform custom concern
                const customConcern = {
                    label: input.value.trim(),
                    type: 'virtual', // Default to virtual for custom concerns
                    time: 15 // Default time estimate
                };
                selectConcern(customConcern);
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

// Topic selector for Advice & Guidance
function initTopicSelectorAutocomplete(categoryId, topics, onChangeCallback) {
    const input = document.getElementById(`topic-input-${categoryId}`);
    const list = document.getElementById(`topic-autocomplete-${categoryId}`);
    const tagsContainer = document.getElementById(`topic-tags-${categoryId}`);
    const contextTextarea = document.getElementById(`topic-context-${categoryId}`);

    if (!input || !list || !tagsContainer) return;

    let selectedTopics = [];
    let highlightedIndex = -1;

    function filterTopics(query) {
        if (!query) return topics.slice(0, 8); // Show first 8 when empty
        const lowerQuery = query.toLowerCase();
        return topics.filter(t =>
            t.toLowerCase().includes(lowerQuery)
        ).slice(0, 8);
    }

    function renderList(topicList) {
        if (topicList.length === 0) {
            list.classList.remove('active');
            return;
        }

        list.innerHTML = topicList.map((topic, i) => `
            <div class="autocomplete-item" data-index="${i}">
                <div class="autocomplete-item-label">${topic}</div>
            </div>
        `).join('');

        list.classList.add('active');
        highlightedIndex = -1;
    }

    function selectTopic(topic) {
        if (selectedTopics.includes(topic)) return;

        selectedTopics.push(topic);
        renderTags();
        input.value = '';
        list.classList.remove('active');
        saveCurrentPetSelections();
        // Update accordion state for chiclets
        const accordion = input.closest('.category-accordion');
        if (accordion) updateAccordionState(accordion);
        onChangeCallback();
    }

    function removeTopic(topic) {
        selectedTopics = selectedTopics.filter(t => t !== topic);
        renderTags();
        saveCurrentPetSelections();
        // Update accordion state for chiclets
        const accordion = input.closest('.category-accordion');
        if (accordion) updateAccordionState(accordion);
        onChangeCallback();
    }

    function renderTags() {
        tagsContainer.innerHTML = selectedTopics.map(topic => `
            <span class="topic-tag" data-topic="${topic}">
                ${topic}
                <button class="topic-tag-remove" data-topic="${topic}"><i class="ph ph-x"></i></button>
            </span>
        `).join('');

        // Add remove event listeners
        tagsContainer.querySelectorAll('.topic-tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeTopic(btn.dataset.topic);
            });
        });
    }

    // Expose getters/setters for this category
    window[`getAdviceTopics_${categoryId}`] = function() {
        return selectedTopics;
    };

    window[`setAdviceTopics_${categoryId}`] = function(topics) {
        selectedTopics = topics || [];
        renderTags();
    };

    window[`getAdviceContext_${categoryId}`] = function() {
        return contextTextarea ? contextTextarea.value : '';
    };

    window[`setAdviceContext_${categoryId}`] = function(context) {
        if (contextTextarea) {
            contextTextarea.value = context || '';
        }
    };

    // Show dropdown on focus
    input.addEventListener('focus', () => {
        const filtered = filterTopics(input.value);
        renderList(filtered);
    });

    input.addEventListener('input', () => {
        const filtered = filterTopics(input.value);
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
            const filtered = filterTopics(input.value);
            if (highlightedIndex >= 0 && items[highlightedIndex]) {
                // Select highlighted autocomplete item
                selectTopic(filtered[highlightedIndex]);
            } else if (input.value.trim()) {
                // Add as custom topic
                selectTopic(input.value.trim());
            }
        } else if (e.key === 'Escape') {
            list.classList.remove('active');
        }
    });

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (item) {
            const filtered = filterTopics(input.value);
            selectTopic(filtered[parseInt(item.dataset.index)]);
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.topic-selector-wrapper')) {
            list.classList.remove('active');
        }
    });

    // Save context on change
    if (contextTextarea) {
        contextTextarea.addEventListener('input', () => {
            saveCurrentPetSelections();
            // Update accordion state to show has-selection
            const accordion = contextTextarea.closest('.category-accordion');
            if (accordion) updateAccordionState(accordion);
            onChangeCallback();
        });
    }
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

// Quote Contact Form
function initQuoteContactForm() {
    const emailCheckbox = document.querySelector('input[name="contact-method"][value="email"]');
    const phoneCheckbox = document.querySelector('input[name="contact-method"][value="phone"]');
    const emailField = document.getElementById('email-field');
    const phoneField = document.getElementById('phone-field');

    if (!emailCheckbox || !phoneCheckbox || !emailField || !phoneField) return;

    function updateFields() {
        emailField.style.display = emailCheckbox.checked ? 'block' : 'none';
        phoneField.style.display = phoneCheckbox.checked ? 'block' : 'none';
    }

    emailCheckbox.addEventListener('change', updateFields);
    phoneCheckbox.addEventListener('change', updateFields);

    // Initial state
    updateFields();
}

// Initialize quote form when DOM is ready
document.addEventListener('DOMContentLoaded', initQuoteContactForm);
