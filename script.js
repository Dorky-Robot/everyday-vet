/**
 * Everyday Vet - Scheduling System
 *
 * Architecture:
 * - State: Single source of truth for household/pets data
 * - Wizard: 3-step flow (Household → Client Type → Services)
 * - Pricing: Household-based consultation + line items
 * - Time: Smart estimation with overlapping activity awareness
 */

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

const STORAGE_KEY = 'everydayvet_schedule';

// Levee API configuration
const LEVEE_CONFIG = {
    apiUrl: 'https://levee.everyday.vet',
    siteKey: 'evv_everyday_vet_dev', // Will be replaced with production key
};

const state = {
    household: {
        pets: [],           // [{ id, name, type, services }]
        isNewClient: null,  // true/false/null
    },
    currentPetId: null,
    currentStep: 0,         // 0: Household, 1: Client Type, 2: Services, 3: Scheduling
    scheduling: {
        selectedDate: null,     // 'YYYY-MM-DD'
        selectedTime: null,     // 'HH:MM'
        selectedTimeDisplay: null, // '10:00 AM'
        calendarMonth: new Date().getMonth(),
        calendarYear: new Date().getFullYear(),
    },
    client: {
        name: '',
        email: '',
        phone: '',
    },
};

function savePetSelections() {
    if (!state.currentPetId) return;

    const pet = state.household.pets.find(p => p.id === state.currentPetId);
    if (!pet) return;

    // Gather all selections from DOM
    const checkboxes = document.querySelectorAll('.service-checkbox input:checked, .single-toggle-checkbox input:checked');
    pet.services.selectedIds = Array.from(checkboxes).map(cb => cb.value);

    // Get advice topics
    const getTopics = window.getAdviceTopics_advice;
    const getContext = window.getAdviceContext_advice;
    pet.services.adviceTopics = getTopics ? getTopics() : [];
    pet.services.adviceContext = getContext ? getContext() : '';

    // Get custom concerns
    pet.services.customConcerns = window.getCustomConcerns ? window.getCustomConcerns() : [];

    saveState();
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Could not save state:', e);
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(state, parsed);
            return true;
        }
    } catch (e) {
        console.warn('Could not load state:', e);
    }
    return false;
}

function clearState() {
    state.household.pets = [];
    state.household.isNewClient = null;
    state.currentPetId = null;
    state.currentStep = 0;
    localStorage.removeItem(STORAGE_KEY);
}

// Expose for debugging
window.getState = () => state;
window.clearState = clearState;

// =============================================================================
// PRICING LOGIC
// =============================================================================

const PRICING = {
    ADVICE_BASE: 75,
    ADVICE_PER_ADDITIONAL_PET: 10,
    TRAVEL_FEE: 100,
};

/**
 * Calculate household consultation fee
 * $75 base + $10 per additional pet (if any advice selected)
 */
function calculateConsultationFee() {
    if (!hasAnyAdviceSelected()) return 0;

    const numPets = Math.max(state.household.pets.length, 1);
    return PRICING.ADVICE_BASE + ((numPets - 1) * PRICING.ADVICE_PER_ADDITIONAL_PET);
}

/**
 * Check if any pet has advice/guidance selected
 * Reads from centralized state only
 */
function hasAnyAdviceSelected() {
    for (const pet of state.household.pets) {
        if (pet.services.adviceTopics?.length > 0) return true;
        if (pet.services.adviceContext?.trim()) return true;
        if (pet.services.customConcerns?.length > 0) return true;
    }
    return false;
}

/**
 * Calculate total line item costs (vaccines, labs, procedures)
 * Reads from centralized state only
 */
function calculateLineItemCosts() {
    let total = 0;

    for (const pet of state.household.pets) {
        for (const serviceId of (pet.services.selectedIds || [])) {
            const cost = getServiceCost(serviceId);
            total += cost;
        }
    }

    return total;
}

function getServiceCost(serviceId) {
    for (const category of SERVICES_CONFIG.categories) {
        if (category.items) {
            const item = category.items.find(i => i.id === serviceId);
            if (item?.cost) return item.cost;
        }
    }
    return 0;
}

/**
 * Determine if visit requires in-person
 * Reads from centralized state only
 */
function requiresInPersonVisit() {
    for (const pet of state.household.pets) {
        // Check selected services
        for (const serviceId of (pet.services.selectedIds || [])) {
            if (isServiceInPerson(serviceId)) return true;
        }

        // Check custom concerns
        for (const concern of (pet.services.customConcerns || [])) {
            if (concern.type === 'in-person') return true;
        }
    }

    return false;
}

function isServiceInPerson(serviceId) {
    for (const category of SERVICES_CONFIG.categories) {
        if (category.items) {
            const item = category.items.find(i => i.id === serviceId);
            if (item) {
                const type = item.type || category.defaultType;
                return type === 'in-person';
            }
        }
        if (category.item?.id === serviceId) {
            return category.defaultType === 'in-person';
        }
    }
    return false;
}

// =============================================================================
// TIME ESTIMATION
// =============================================================================

/**
 * Smart appointment time estimation
 * Understands that activities overlap and don't accumulate linearly
 */
function estimateAppointmentTime() {
    const data = gatherAppointmentData();
    let minutes = 0;
    let reasoning = [];

    // Base setup: 5 min
    minutes += 5;

    // Discussion topics (diminishing returns)
    const totalTopics = data.adviceTopics.length + data.customConcerns.length;
    if (totalTopics > 0) {
        let discussionTime = 15; // Base
        if (totalTopics > 1) {
            const tier1 = Math.min(totalTopics - 1, 2);  // Topics 2-3: +3 min each
            const tier2 = Math.min(Math.max(totalTopics - 3, 0), 3); // Topics 4-6: +2 min each
            const tier3 = Math.max(totalTopics - 6, 0);  // 7+: +1 min each
            discussionTime += (tier1 * 3) + (tier2 * 2) + (tier3 * 1);
        }
        minutes += discussionTime;
        reasoning.push(`Discussion: ~${discussionTime} min`);
    }

    // Physical exam
    if (data.physicalExam === 'comprehensive') {
        minutes += 15;
        reasoning.push('Comprehensive exam: ~15 min');
    } else if (data.physicalExam === 'quick') {
        minutes += 5;
        reasoning.push('Quick exam: ~5 min');
    }

    // Vaccines (prep is the bottleneck, not injection count)
    if (data.vaccines.length > 0) {
        minutes += 6;
        reasoning.push(`Vaccines (${data.vaccines.length}): ~6 min`);
    }

    // Lab work
    if (data.labs.length > 0) {
        const labTime = Math.min(data.labs.length * 4, 12);
        minutes += labTime;
        reasoning.push(`Lab collection: ~${labTime} min`);
    }

    // Procedures
    if (data.procedures.length > 0) {
        let procTime = data.procedures.reduce((sum, p) => sum + (p.time || 10), 0);
        if (data.procedures.length > 1) procTime = Math.round(procTime * 0.85); // Efficiency
        minutes += procTime;
        reasoning.push(`Procedures: ~${procTime} min`);
    }

    // Multiple pets receiving services: +65% for each additional
    if (data.petsWithServices > 1) {
        const additionalTime = Math.round((minutes - 5) * 0.65 * (data.petsWithServices - 1));
        minutes += additionalTime;
        reasoning.push(`Additional pets: ~${additionalTime} min`);
    }

    // Round to nearest 5, minimum 15
    minutes = Math.max(15, Math.round(minutes / 5) * 5);

    return {
        minutes,
        formatted: formatDuration(minutes),
        reasoning: reasoning.join(' • ')
    };
}

/**
 * Gather appointment data from ALL pets' centralized state
 */
function gatherAppointmentData() {
    const data = {
        adviceTopics: [],
        customConcerns: [],
        vaccines: [],
        labs: [],
        procedures: [],
        physicalExam: null,
        petsWithServices: 0
    };

    for (const pet of state.household.pets) {
        let petHasServices = false;

        // Advice topics
        if (pet.services.adviceTopics?.length > 0) {
            data.adviceTopics.push(...pet.services.adviceTopics);
            petHasServices = true;
        }

        // Custom concerns
        if (pet.services.customConcerns?.length > 0) {
            data.customConcerns.push(...pet.services.customConcerns);
            petHasServices = true;
        }

        // Categorize selected services
        for (const serviceId of (pet.services.selectedIds || [])) {
            const serviceInfo = getServiceInfo(serviceId);
            if (!serviceInfo) continue;

            petHasServices = true;

            if (serviceInfo.group === 'exam') {
                data.physicalExam = 'comprehensive';
            } else if (serviceInfo.group === 'vaccines') {
                data.vaccines.push(serviceInfo);
                if (!data.physicalExam) data.physicalExam = 'quick';
            } else if (serviceInfo.group === 'labs') {
                data.labs.push(serviceInfo);
            } else if (serviceInfo.group === 'procedures' || serviceInfo.group === 'special') {
                data.procedures.push(serviceInfo);
            }
        }

        if (petHasServices) data.petsWithServices++;
    }

    return data;
}

/**
 * Get service info from config by ID
 */
function getServiceInfo(serviceId) {
    for (const category of SERVICES_CONFIG.categories) {
        if (category.item?.id === serviceId) {
            return {
                id: serviceId,
                label: category.item.label,
                time: category.item.time || 10,
                group: category.id
            };
        }
        if (category.items) {
            const item = category.items.find(i => i.id === serviceId);
            if (item) {
                return {
                    id: serviceId,
                    label: item.label,
                    time: item.time || 10,
                    group: category.id
                };
            }
        }
    }
    return null;
}

function formatDuration(minutes) {
    if (minutes < 60) return `${minutes} minutes`;
    if (minutes === 60) return '1 hour';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hrs} hour${hrs > 1 ? 's' : ''}`;
    return `${hrs} hr ${mins} min`;
}

// =============================================================================
// WIZARD NAVIGATION
// =============================================================================

function initWizard() {
    const dots = document.querySelectorAll('.step-dot');
    const steps = document.querySelectorAll('.estimator-step');

    if (!dots.length || !steps.length) return;

    // Dot click navigation
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            // Can only go back, or forward if requirements met
            if (index < state.currentStep) {
                goToStep(index);
            } else if (index === state.currentStep + 1) {
                // Check if can proceed
                if (canProceedFromStep(state.currentStep)) {
                    goToStep(index);
                }
            }
        });
    });

    // Household continue button
    const continueBtn = document.getElementById('household-continue-btn');
    continueBtn?.addEventListener('click', () => {
        if (state.household.pets.length > 0) {
            goToStep(1);
        }
    });

    // Customer type buttons
    const btnNew = document.getElementById('btn-new-customer');
    const btnExisting = document.getElementById('btn-existing-customer');

    btnNew?.addEventListener('click', () => {
        state.household.isNewClient = true;
        showClientTypeContent();
        goToStep(2);
    });

    btnExisting?.addEventListener('click', () => {
        state.household.isNewClient = false;
        showClientTypeContent();
        goToStep(2);
    });

    // Initial state
    if (loadState() && state.household.pets.length > 0) {
        renderPetCards();
        updateHouseholdStepUI();
        goToStep(state.currentStep);
    } else {
        goToStep(0);
    }
}

function canProceedFromStep(step) {
    if (step === 0) {
        return state.household.pets.length > 0;
    }
    return true;
}

function goToStep(stepIndex) {
    state.currentStep = stepIndex;

    // Update step visibility
    document.querySelectorAll('.estimator-step').forEach((step, i) => {
        step.classList.toggle('active', i === stepIndex);
    });

    // Update dots
    document.querySelectorAll('.step-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === stepIndex);
        dot.classList.toggle('completed', i < stepIndex);
    });

    // Step-specific setup
    if (stepIndex === 1) {
        updateNewClientPricing();
    } else if (stepIndex === 2) {
        showClientTypeContent();
        if (!state.household.isNewClient && state.household.pets.length > 0) {
            selectPet(state.currentPetId || state.household.pets[0].id);
        }
    } else if (stepIndex === 3) {
        initSchedulingStep();
    }

    saveState();
}

function showClientTypeContent() {
    const newContent = document.getElementById('new-customer-content');
    const existingContent = document.getElementById('existing-customer-content');

    if (state.household.isNewClient) {
        newContent.style.display = 'block';
        existingContent.style.display = 'none';
    } else {
        newContent.style.display = 'none';
        existingContent.style.display = 'grid';
    }
}

function updateNewClientPricing() {
    const numPets = state.household.pets.length;
    const virtualPrice = PRICING.ADVICE_BASE + ((numPets - 1) * PRICING.ADVICE_PER_ADDITIONAL_PET);
    const inPersonPrice = virtualPrice + PRICING.TRAVEL_FEE;

    const virtualPriceEl = document.querySelector('#onboarding-virtual + label .option-price');
    const inPersonPriceEl = document.querySelector('#onboarding-inperson + label .option-price');

    if (virtualPriceEl) virtualPriceEl.textContent = `$${virtualPrice}`;
    if (inPersonPriceEl) inPersonPriceEl.textContent = `$${inPersonPrice}`;
}

// =============================================================================
// PET MANAGEMENT
// =============================================================================

function initPetManagement() {
    const addBtn = document.getElementById('add-pet-btn');
    const modal = document.getElementById('add-pet-modal');
    const nameInput = document.getElementById('pet-name-input');
    const typeButtons = document.querySelectorAll('.pet-type-btn');
    const cancelBtn = document.getElementById('pet-modal-cancel');
    const confirmBtn = document.getElementById('pet-modal-add');

    if (!addBtn || !modal) return;

    let selectedType = null;

    addBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        nameInput.value = '';
        selectedType = null;
        typeButtons.forEach(b => b.classList.remove('selected'));
        confirmBtn.disabled = true;
        nameInput.focus();
    });

    cancelBtn.addEventListener('click', () => modal.style.display = 'none');

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            typeButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedType = btn.dataset.type;
            confirmBtn.disabled = !nameInput.value.trim();
        });
    });

    nameInput.addEventListener('input', () => {
        confirmBtn.disabled = !nameInput.value.trim() || !selectedType;
    });

    confirmBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name || !selectedType) return;

        addPet(name, selectedType);
        modal.style.display = 'none';
    });
}

function addPet(name, type) {
    const pet = {
        id: Date.now(),
        name,
        type,
        services: {
            selectedIds: [],
            adviceTopics: [],
            adviceContext: '',
            customConcerns: []
        }
    };

    state.household.pets.push(pet);
    renderPetCards();
    selectPet(pet.id);
    saveState();

    // Enable proceed button if this is first pet
    updateHouseholdStepUI();
}

function removePet(petId) {
    state.household.pets = state.household.pets.filter(p => p.id !== petId);

    if (state.currentPetId === petId) {
        state.currentPetId = state.household.pets[0]?.id || null;
    }

    renderPetCards();

    if (state.currentPetId) {
        selectPet(state.currentPetId);
    } else {
        document.getElementById('pet-services-section').style.display = 'none';
        updateEstimateDisplay();
    }

    saveState();
    updateHouseholdStepUI();
}

function selectPet(petId) {
    // Save current pet's selections before switching
    savePetSelections();

    state.currentPetId = petId;

    // Re-render pet tabs to update active states
    renderPetCards();

    const pet = state.household.pets.find(p => p.id === petId);
    if (!pet) return;

    // Update header
    const nameEl = document.getElementById('current-pet-name');
    if (nameEl) nameEl.textContent = pet.name;

    const servicesSection = document.getElementById('pet-services-section');
    if (servicesSection) servicesSection.style.display = 'block';

    // Render services for this pet type
    renderServiceCategories(pet.type);
    initAccordions();
    initEstimator();

    // Restore this pet's selections
    restorePetSelections(pet);

    updateEstimateDisplay();
    saveState();
}

function restorePetSelections(pet) {
    // Checkboxes
    const checkboxes = document.querySelectorAll('.service-checkbox input, .single-toggle-checkbox input');
    checkboxes.forEach(cb => {
        cb.checked = pet.services.selectedIds?.includes(cb.value) || false;
    });

    // Advice topics
    const setTopics = window.setAdviceTopics_advice;
    const setContext = window.setAdviceContext_advice;
    if (setTopics) setTopics(pet.services.adviceTopics || []);
    if (setContext) setContext(pet.services.adviceContext || '');

    // Custom concerns
    if (window.setCustomConcerns) {
        window.setCustomConcerns(pet.services.customConcerns || []);
    }

    // Update accordions
    document.querySelectorAll('.category-accordion').forEach(updateAccordionState);
}

function renderPetCards() {
    // Render in household step
    const householdContainer = document.getElementById('pet-tabs');
    const addBtn = document.getElementById('add-pet-btn');

    if (householdContainer) {
        householdContainer.querySelectorAll('.pet-tab').forEach(t => t.remove());

        state.household.pets.forEach(pet => {
            const tab = document.createElement('button');
            tab.className = `pet-tab${pet.id === state.currentPetId ? ' active' : ''}`;
            tab.dataset.petId = pet.id;
            tab.innerHTML = `
                <span class="pet-icon"><i class="ph ph-${pet.type}"></i></span>
                <span class="pet-name">${pet.name}</span>
                <span class="remove-pet"><i class="ph ph-x"></i></span>
            `;

            tab.querySelector('.remove-pet').addEventListener('click', (e) => {
                e.stopPropagation();
                removePet(pet.id);
            });

            tab.addEventListener('click', (e) => {
                if (!e.target.closest('.remove-pet')) {
                    selectPet(pet.id);
                }
            });

            if (addBtn) {
                householdContainer.insertBefore(tab, addBtn);
            } else {
                householdContainer.appendChild(tab);
            }
        });
    }

    // Render in services step (inline tabs for switching between pets)
    const servicesContainer = document.getElementById('pet-tabs-services');
    if (servicesContainer) {
        servicesContainer.innerHTML = '';

        state.household.pets.forEach(pet => {
            const tab = document.createElement('button');
            tab.className = `pet-tab-inline${pet.id === state.currentPetId ? ' active' : ''}`;
            tab.dataset.petId = pet.id;
            tab.innerHTML = `
                <span class="pet-icon"><i class="ph ph-${pet.type}"></i></span>
                <span class="pet-name">${pet.name}</span>
            `;

            tab.addEventListener('click', () => selectPet(pet.id));
            servicesContainer.appendChild(tab);
        });
    }
}

function updateHouseholdStepUI() {
    const continueBtn = document.getElementById('household-continue-btn');
    if (continueBtn) {
        continueBtn.disabled = state.household.pets.length === 0;
    }
}

// =============================================================================
// SERVICE RENDERING
// =============================================================================

function renderServiceCategories(petType) {
    const container = document.getElementById('service-categories-container');
    if (!container) return;

    let html = '';

    SERVICES_CONFIG.categories.forEach(category => {
        if (category.isTopicSelector) {
            html += renderTopicSelectorCategory(category);
        } else if (category.isCustomInput) {
            html += renderCustomInputCategory(category);
        } else if (category.isSingleToggle) {
            html += renderSingleToggleCategory(category);
        } else if (category.items) {
            html += renderCheckboxCategory(category, petType);
        }
    });

    container.innerHTML = html;
}

function renderCategorySubtitle(category) {
    let icons = '';
    if (category.visitType === 'both') {
        icons = '<i class="ph ph-video-camera"></i><i class="ph ph-house"></i>';
    } else if (category.visitType === 'in-person') {
        icons = '<i class="ph ph-house"></i>';
    } else if (category.visitType === 'search') {
        icons = '<i class="ph ph-magnifying-glass"></i>';
    } else {
        icons = '<i class="ph ph-video-camera"></i>';
    }

    const text = category.pricingNote || '';
    return `<span class="subtitle-icons">${icons}</span>${text ? `<span class="subtitle-text">${text}</span>` : ''}`;
}

function renderTopicSelectorCategory(category) {
    return `
        <div class="category-accordion" data-category="${category.id}">
            <button class="category-header">
                <span class="category-title">${category.title}</span>
                <span class="category-subtitle">${renderCategorySubtitle(category)}</span>
                <span class="category-toggle"><i class="ph ph-plus"></i></span>
            </button>
            <div class="selected-chiclets" data-category="${category.id}"></div>
            <div class="category-content">
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
                    <textarea id="topic-context-${category.id}" class="topic-context-textarea" placeholder="Feel free to share any additional context..."></textarea>
                </div>
            </div>
        </div>
    `;
}

function renderCustomInputCategory(category) {
    return `
        <div class="category-accordion" data-category="${category.id}">
            <button class="category-header">
                <span class="category-title">${category.title}</span>
                <span class="category-subtitle">${renderCategorySubtitle(category)}</span>
                <span class="category-toggle"><i class="ph ph-plus"></i></span>
            </button>
            <div class="selected-chiclets" data-category="${category.id}"></div>
            <div class="category-content">
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
}

function renderSingleToggleCategory(category) {
    const item = category.item;
    return `
        <div class="category-single-toggle" data-category="${category.id}">
            <label class="single-toggle-checkbox">
                <input type="checkbox" name="service" value="${item.id}"
                    data-type="${category.defaultType}"
                    data-group="${category.id}"
                    data-time="${item.time}"
                    data-time-mode="${category.timeMode}">
                <span class="checkbox-custom"></span>
                <span class="single-toggle-title">${category.title}</span>
                <span class="single-toggle-subtitle">${renderCategorySubtitle(category)}</span>
            </label>
        </div>
    `;
}

function renderCheckboxCategory(category, petType) {
    const items = category.items.filter(item => {
        if (!item.petType) return true;
        return item.petType === petType || item.petType === 'both';
    });

    if (items.length === 0) return '';

    return `
        <div class="category-accordion" data-category="${category.id}">
            <button class="category-header">
                <span class="category-title">${category.title}</span>
                <span class="category-subtitle">${renderCategorySubtitle(category)}</span>
                <span class="category-toggle"><i class="ph ph-plus"></i></span>
            </button>
            <div class="selected-chiclets" data-category="${category.id}"></div>
            <div class="category-content">
                ${category.note ? `<p class="category-note">${category.note}</p>` : ''}
                <div class="service-options">
                    ${items.map(item => renderServiceItem(item, category)).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderServiceItem(item, category) {
    return `
        <label class="service-checkbox${item.cost ? ' has-price' : ''}">
            <input type="checkbox" name="service" value="${item.id}"
                data-type="${item.type || category.defaultType}"
                data-group="${category.id}"
                data-time="${item.time}"
                data-time-mode="${category.timeMode}"
                ${item.cost ? `data-cost="${item.cost}"` : ''}>
            <span class="checkbox-custom"></span>
            <span class="checkbox-label">${item.label}</span>
            ${item.cost ? `<span class="item-price">$${item.cost}</span>` : ''}
            ${item.note ? `<span class="checkbox-note">${item.note}</span>` : ''}
        </label>
    `;
}

// =============================================================================
// ACCORDIONS & CHICLETS
// =============================================================================

function initAccordions() {
    document.querySelectorAll('.category-accordion').forEach(accordion => {
        const header = accordion.querySelector('.category-header');

        header.addEventListener('click', () => {
            accordion.classList.toggle('expanded');
        });

        accordion.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => updateAccordionState(accordion));
        });

        updateAccordionState(accordion);
    });
}

function updateAccordionState(accordion) {
    const hasChecked = accordion.querySelectorAll('input:checked').length > 0;
    const hasConcernTags = accordion.querySelectorAll('.concern-tag').length > 0;
    const hasTopicTags = accordion.querySelectorAll('.topic-tag').length > 0;
    const textarea = accordion.querySelector('.topic-context-textarea');
    const hasContext = textarea?.value.trim().length > 0;

    accordion.classList.toggle('has-selection', hasChecked || hasConcernTags || hasTopicTags || hasContext);
    updateChiclets(accordion);
}

function updateChiclets(accordion) {
    const container = accordion.querySelector('.selected-chiclets');
    if (!container) return;

    const categoryId = accordion.dataset.category;
    const checked = accordion.querySelectorAll('input:checked');
    const isVaccines = categoryId === 'vaccines';
    const isOther = categoryId === 'other';

    const customConcerns = isOther && window.getCustomConcerns ? window.getCustomConcerns() : [];
    const getTopics = window[`getAdviceTopics_${categoryId}`];
    const adviceTopics = getTopics ? getTopics() : [];

    if (checked.length === 0 && customConcerns.length === 0 && adviceTopics.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // Auto "Free Quick Exam" for vaccines
    if (isVaccines && checked.length > 0) {
        html += `
            <span class="service-chiclet chiclet-free" title="A quick examination is included free with vaccinations to ensure your pet is healthy enough to receive them safely.">
                <span class="chiclet-label">Free Quick Exam</span>
            </span>
        `;
    }

    // Checkbox chiclets
    checked.forEach(cb => {
        const label = cb.closest('.service-checkbox')?.querySelector('.checkbox-label')?.textContent || cb.value;
        html += `
            <span class="service-chiclet" data-service-id="${cb.value}">
                <span class="chiclet-label">${label}</span>
                <span class="chiclet-remove"><i class="ph ph-x"></i></span>
            </span>
        `;
    });

    // Custom concern chiclets
    customConcerns.forEach(c => {
        html += `
            <span class="service-chiclet" data-concern-label="${c.label}">
                <span class="chiclet-label">${c.label}</span>
                <span class="chiclet-remove"><i class="ph ph-x"></i></span>
            </span>
        `;
    });

    // Advice topic chiclets
    adviceTopics.forEach(t => {
        html += `
            <span class="service-chiclet" data-topic="${t}">
                <span class="chiclet-label">${t}</span>
                <span class="chiclet-remove"><i class="ph ph-x"></i></span>
            </span>
        `;
    });

    container.innerHTML = html;

    // Click handlers for removal
    container.querySelectorAll('.service-chiclet[data-service-id]').forEach(chiclet => {
        chiclet.addEventListener('click', () => {
            const cb = accordion.querySelector(`input[value="${chiclet.dataset.serviceId}"]`);
            if (cb) {
                cb.checked = false;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });

    container.querySelectorAll('.service-chiclet[data-concern-label]').forEach(chiclet => {
        chiclet.addEventListener('click', () => {
            const btn = accordion.querySelector(`.concern-tag-remove[data-label="${chiclet.dataset.concernLabel}"]`);
            btn?.click();
        });
    });

    container.querySelectorAll('.service-chiclet[data-topic]').forEach(chiclet => {
        chiclet.addEventListener('click', () => {
            const btn = accordion.querySelector(`.topic-tag-remove[data-topic="${chiclet.dataset.topic}"]`);
            btn?.click();
        });
    });
}

// =============================================================================
// ESTIMATE DISPLAY
// =============================================================================

function initEstimator() {
    const checkboxes = document.querySelectorAll('.service-checkbox input, .single-toggle-checkbox input');

    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            savePetSelections();
            updateEstimateDisplay();
        });
    });

    // Initialize autocomplete handlers
    initCustomConcernAutocomplete(updateEstimateDisplay);

    SERVICES_CONFIG.categories.forEach(category => {
        if (category.isTopicSelector && category.topics) {
            initTopicSelectorAutocomplete(category.id, category.topics, updateEstimateDisplay);
        }
    });

    window.recalculateEstimate = updateEstimateDisplay;
}

function updateEstimateDisplay() {
    const resultEmpty = document.getElementById('result-empty');
    const resultContent = document.getElementById('result-content');

    if (!hasAnySelections()) {
        resultEmpty.style.display = 'block';
        resultContent.style.display = 'none';
        return;
    }

    resultEmpty.style.display = 'none';
    resultContent.style.display = 'block';

    // Visit type
    const isInPerson = requiresInPersonVisit();
    document.getElementById('visit-type-value').textContent = isInPerson ? 'In-Person Visit' : 'Virtual Visit';
    document.getElementById('visit-type-location').textContent = isInPerson ? 'Greater Cleveland Area' : 'Anywhere in Ohio';

    // Duration
    const timeEstimate = estimateAppointmentTime();
    document.getElementById('duration-display').textContent = timeEstimate.formatted;
    const reasoning = document.getElementById('duration-reasoning');
    if (reasoning) {
        reasoning.textContent = timeEstimate.reasoning;
        reasoning.style.display = timeEstimate.reasoning ? 'block' : 'none';
    }

    // Pricing
    const consultationFee = calculateConsultationFee();
    const lineItemCosts = calculateLineItemCosts();
    const travelFee = isInPerson ? PRICING.TRAVEL_FEE : 0;
    const total = consultationFee + lineItemCosts + travelFee;

    // Update UI
    const consultationLine = document.getElementById('consultation-fee-line');
    const consultationLabel = document.getElementById('consultation-label');
    const consultationFeeEl = document.getElementById('consultation-fee');

    if (consultationFee > 0) {
        consultationLine.style.display = 'flex';
        const numPets = state.household.pets.length;
        consultationLabel.textContent = numPets > 1 ? `Advice & Guidance (${numPets} pets)` : 'Advice & Guidance';
        consultationFeeEl.textContent = `$${consultationFee}`;
    } else {
        consultationLine.style.display = 'none';
    }

    const itemizedLine = document.getElementById('itemized-fee-line');
    const itemizedFeeEl = document.getElementById('itemized-fee');
    if (lineItemCosts > 0) {
        itemizedLine.style.display = 'flex';
        itemizedFeeEl.textContent = `$${lineItemCosts}`;
    } else {
        itemizedLine.style.display = 'none';
    }

    const travelLine = document.getElementById('travel-fee-line');
    const travelFeeEl = document.getElementById('travel-fee');
    if (travelFee > 0) {
        travelLine.style.display = 'flex';
        travelFeeEl.textContent = `$${travelFee}`;
    } else {
        travelLine.style.display = 'none';
    }

    document.getElementById('total-price').textContent = `$${total}`;
}

/**
 * Check if any pet has any selections
 * Reads from centralized state only
 */
function hasAnySelections() {
    for (const pet of state.household.pets) {
        if (pet.services.selectedIds?.length > 0) return true;
        if (pet.services.adviceTopics?.length > 0) return true;
        if (pet.services.adviceContext?.trim()) return true;
        if (pet.services.customConcerns?.length > 0) return true;
    }
    return false;
}

// =============================================================================
// AUTOCOMPLETE: CUSTOM CONCERNS
// =============================================================================

const veterinaryConcerns = [
    // Physical symptoms (virtual)
    { label: 'Itching or scratching', type: 'virtual', time: 20 },
    { label: 'Hair loss or bald patches', type: 'virtual', time: 20 },
    { label: 'Hot spots', type: 'virtual', time: 15 },
    { label: 'Ear odor or discharge', type: 'virtual', time: 15 },
    { label: 'Eye discharge or redness', type: 'virtual', time: 15 },
    { label: 'Coughing', type: 'virtual', time: 20 },
    { label: 'Sneezing or nasal discharge', type: 'virtual', time: 15 },
    { label: 'Bad breath', type: 'virtual', time: 15 },
    { label: 'Vomiting', type: 'virtual', time: 20 },
    { label: 'Diarrhea', type: 'virtual', time: 20 },
    { label: 'Constipation', type: 'virtual', time: 15 },
    { label: 'Increased thirst or urination', type: 'virtual', time: 20 },
    { label: 'Decreased appetite', type: 'virtual', time: 20 },
    { label: 'Limping (mild)', type: 'virtual', time: 20 },
    { label: 'Stiffness or mobility issues', type: 'virtual', time: 20 },
    { label: 'Lump or bump (assessment)', type: 'virtual', time: 15 },
    { label: 'Skin rash or redness', type: 'virtual', time: 15 },

    // In-person procedures
    { label: 'Nail trim', type: 'in-person', time: 10 },
    { label: 'Anal gland expression', type: 'in-person', time: 10 },
    { label: 'Skin scraping', type: 'in-person', time: 15 },
    { label: 'Abscess drainage', type: 'in-person', time: 25 },
    { label: 'Suture removal', type: 'in-person', time: 15 },
    { label: 'Bandage change', type: 'in-person', time: 15 },
    { label: 'Fecal sample collection', type: 'in-person', time: 10 },
    { label: 'Deworming treatment', type: 'in-person', time: 10 },

    // Unavailable
    { label: 'Dental cleaning', type: 'unavailable', note: 'Requires anesthesia - referral needed' },
    { label: 'Spay/neuter surgery', type: 'unavailable', note: 'Surgical procedure - referral needed' },
    { label: 'X-rays', type: 'unavailable', note: 'Requires imaging equipment - referral needed' },
    { label: 'Emergency care', type: 'unavailable', note: 'Please contact 24/7 emergency hospital' },
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
        const lower = query.toLowerCase();
        return veterinaryConcerns.filter(c => c.label.toLowerCase().includes(lower)).slice(0, 8);
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
            return `
                <div class="autocomplete-item${c.type === 'unavailable' ? ' autocomplete-item-unavailable' : ''}" data-index="${i}">
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
        savePetSelections();
        const accordion = input.closest('.category-accordion');
        if (accordion) updateAccordionState(accordion);
        onChangeCallback();
    }

    function removeConcern(label) {
        selectedConcerns = selectedConcerns.filter(c => c.label !== label);
        renderTags();
        savePetSelections();
        const accordion = input.closest('.category-accordion');
        if (accordion) updateAccordionState(accordion);
        onChangeCallback();
    }

    function renderTags() {
        tagsContainer.innerHTML = selectedConcerns.map(c => `
            <span class="concern-tag ${c.type === 'in-person' ? 'in-person' : ''}" data-label="${c.label}">
                ${c.label}
                <button class="concern-tag-remove" data-label="${c.label}"><i class="ph ph-x"></i></button>
            </span>
        `).join('');

        tagsContainer.querySelectorAll('.concern-tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeConcern(btn.dataset.label);
            });
        });
    }

    window.getCustomConcerns = () => selectedConcerns;
    window.setCustomConcerns = (concerns) => {
        selectedConcerns = concerns || [];
        renderTags();
    };

    input.addEventListener('input', () => renderList(filterConcerns(input.value)));

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
            if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
                selectConcern(filtered[highlightedIndex]);
            } else if (input.value.trim()) {
                selectConcern({ label: input.value.trim(), type: 'virtual', time: 15 });
            }
        } else if (e.key === 'Escape') {
            list.classList.remove('active');
        }
    });

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (item) {
            selectConcern(filterConcerns(input.value)[parseInt(item.dataset.index)]);
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-concern-wrapper')) list.classList.remove('active');
    });
}

// =============================================================================
// AUTOCOMPLETE: ADVICE TOPICS
// =============================================================================

function initTopicSelectorAutocomplete(categoryId, topics, onChangeCallback) {
    const input = document.getElementById(`topic-input-${categoryId}`);
    const list = document.getElementById(`topic-autocomplete-${categoryId}`);
    const tagsContainer = document.getElementById(`topic-tags-${categoryId}`);
    const contextTextarea = document.getElementById(`topic-context-${categoryId}`);

    if (!input || !list || !tagsContainer) return;

    let selectedTopics = [];
    let highlightedIndex = -1;

    function filterTopics(query) {
        if (!query) return topics.slice(0, 8);
        const lower = query.toLowerCase();
        return topics.filter(t => t.toLowerCase().includes(lower)).slice(0, 8);
    }

    function renderList(topicList) {
        if (topicList.length === 0) {
            list.classList.remove('active');
            return;
        }

        list.innerHTML = topicList.map((t, i) => `
            <div class="autocomplete-item" data-index="${i}">
                <div class="autocomplete-item-label">${t}</div>
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
        savePetSelections();
        const accordion = input.closest('.category-accordion');
        if (accordion) updateAccordionState(accordion);
        onChangeCallback();
    }

    function removeTopic(topic) {
        selectedTopics = selectedTopics.filter(t => t !== topic);
        renderTags();
        savePetSelections();
        const accordion = input.closest('.category-accordion');
        if (accordion) updateAccordionState(accordion);
        onChangeCallback();
    }

    function renderTags() {
        tagsContainer.innerHTML = selectedTopics.map(t => `
            <span class="topic-tag" data-topic="${t}">
                ${t}
                <button class="topic-tag-remove" data-topic="${t}"><i class="ph ph-x"></i></button>
            </span>
        `).join('');

        tagsContainer.querySelectorAll('.topic-tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeTopic(btn.dataset.topic);
            });
        });
    }

    window[`getAdviceTopics_${categoryId}`] = () => selectedTopics;
    window[`setAdviceTopics_${categoryId}`] = (t) => { selectedTopics = t || []; renderTags(); };
    window[`getAdviceContext_${categoryId}`] = () => contextTextarea?.value || '';
    window[`setAdviceContext_${categoryId}`] = (c) => { if (contextTextarea) contextTextarea.value = c || ''; };

    input.addEventListener('focus', () => renderList(filterTopics(input.value)));
    input.addEventListener('input', () => renderList(filterTopics(input.value)));

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
            if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
                selectTopic(filtered[highlightedIndex]);
            } else if (input.value.trim()) {
                selectTopic(input.value.trim());
            }
        } else if (e.key === 'Escape') {
            list.classList.remove('active');
        }
    });

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (item) {
            selectTopic(filterTopics(input.value)[parseInt(item.dataset.index)]);
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.topic-selector-wrapper')) list.classList.remove('active');
    });

    if (contextTextarea) {
        contextTextarea.addEventListener('input', () => {
            savePetSelections();
            const accordion = contextTextarea.closest('.category-accordion');
            if (accordion) updateAccordionState(accordion);
            onChangeCallback();
        });
    }
}

// =============================================================================
// UI EFFECTS & NAVIGATION
// =============================================================================

function initParallax() {
    const hero = document.querySelector('#hero');
    const heroContent = document.querySelector('.hero-content');

    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        if (hero) hero.style.backgroundPositionY = `${scrolled * 0.5}px`;
        if (heroContent) {
            heroContent.style.transform = `translateY(${scrolled * 0.3}px)`;
            heroContent.style.opacity = 1 - (scrolled * 0.002);
        }
    });
}

function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('visible');
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in, .slide-in-left, .slide-in-right, .service-card, .pricing-card').forEach(el => {
        observer.observe(el);
    });
}

function initNavbarScroll() {
    const header = document.querySelector('header');
    window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.pageYOffset > 50);
    });
}

function initMobileMenu() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    const overlay = document.querySelector('.nav-overlay');

    if (!menuBtn || !navLinks) return;

    function toggleMenu() {
        menuBtn.classList.toggle('active');
        navLinks.classList.toggle('active');
        overlay?.classList.toggle('active');
        document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
    }

    function closeMenu() {
        menuBtn.classList.remove('active');
        navLinks.classList.remove('active');
        overlay?.classList.remove('active');
        document.body.style.overflow = '';
    }

    menuBtn.addEventListener('click', toggleMenu);
    overlay?.addEventListener('click', closeMenu);
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) closeMenu();
    });
}

function initSchedulingButton() {
    const btn = document.getElementById('continue-to-scheduling-btn');
    btn?.addEventListener('click', () => {
        // Save current selections before proceeding
        savePetSelections();
        // Go to step 3 (scheduling)
        goToStep(3);
    });
}

// =============================================================================
// SCHEDULING (STEP 3 & 4)
// =============================================================================

function initSchedulingStep() {
    renderCalendar();
    updateSchedulingSummary();
    initClientForm();
    initBookingButton();

    // Calendar navigation
    const prevBtn = document.getElementById('cal-prev');
    const nextBtn = document.getElementById('cal-next');

    prevBtn?.addEventListener('click', () => {
        state.scheduling.calendarMonth--;
        if (state.scheduling.calendarMonth < 0) {
            state.scheduling.calendarMonth = 11;
            state.scheduling.calendarYear--;
        }
        renderCalendar();
    });

    nextBtn?.addEventListener('click', () => {
        state.scheduling.calendarMonth++;
        if (state.scheduling.calendarMonth > 11) {
            state.scheduling.calendarMonth = 0;
            state.scheduling.calendarYear++;
        }
        renderCalendar();
    });
}

function renderCalendar() {
    const container = document.getElementById('cal-days');
    const monthLabel = document.getElementById('cal-month');
    if (!container || !monthLabel) return;

    const { calendarMonth, calendarYear } = state.scheduling;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    monthLabel.textContent = `${months[calendarMonth]} ${calendarYear}`;

    // First day of the month and number of days
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    let html = '';

    // Empty cells for days before the first of the month
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<span class="calendar-day empty"></span>';
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(calendarYear, calendarMonth, day);
        const dateStr = formatDateISO(date);
        const isPast = date < today;
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isSelected = dateStr === state.scheduling.selectedDate;

        let classes = 'calendar-day';
        if (isPast) classes += ' disabled';
        if (isWeekend) classes += ' weekend';
        if (isSelected) classes += ' selected';

        html += `<button class="${classes}" data-date="${dateStr}" ${isPast ? 'disabled' : ''}>${day}</button>`;
    }

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.calendar-day:not(.disabled):not(.empty)').forEach(btn => {
        btn.addEventListener('click', () => selectDate(btn.dataset.date));
    });

    // Disable prev button if viewing current month
    const prevBtn = document.getElementById('cal-prev');
    const isCurrentMonth = calendarYear === today.getFullYear() && calendarMonth === today.getMonth();
    prevBtn?.classList.toggle('disabled', isCurrentMonth);
    if (prevBtn) prevBtn.disabled = isCurrentMonth;
}

function formatDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

async function selectDate(dateStr) {
    state.scheduling.selectedDate = dateStr;
    state.scheduling.selectedTime = null;
    state.scheduling.selectedTimeDisplay = null;

    // Update calendar UI
    document.querySelectorAll('.calendar-day.selected').forEach(d => d.classList.remove('selected'));
    document.querySelector(`.calendar-day[data-date="${dateStr}"]`)?.classList.add('selected');

    // Show time section
    document.getElementById('time-section').style.display = 'block';
    document.getElementById('selected-date-display').textContent = formatDateDisplay(dateStr);

    // Fetch available slots
    await fetchTimeSlots(dateStr);
    updateSchedulingSummary();
    updateBookingButtonState();
    saveState();
}

async function fetchTimeSlots(dateStr) {
    const slotsContainer = document.getElementById('time-slots');
    const loadingEl = document.getElementById('time-slots-loading');
    const emptyEl = document.getElementById('time-slots-empty');

    slotsContainer.innerHTML = '';
    loadingEl.style.display = 'flex';
    emptyEl.style.display = 'none';

    try {
        const duration = estimateAppointmentTime().minutes;
        const url = `${LEVEE_CONFIG.apiUrl}/api/public/slots?siteKey=${encodeURIComponent(LEVEE_CONFIG.siteKey)}&date=${dateStr}&duration=${duration}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-Site-Key': LEVEE_CONFIG.siteKey,
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch slots');
        }

        const data = await response.json();
        loadingEl.style.display = 'none';

        if (!data.slots || data.slots.length === 0) {
            emptyEl.style.display = 'block';
            return;
        }

        renderTimeSlots(data.slots);

    } catch (error) {
        console.error('Error fetching time slots:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.querySelector('p').textContent = 'Unable to load available times. Please try again.';
    }
}

function renderTimeSlots(slots) {
    const container = document.getElementById('time-slots');

    container.innerHTML = slots.map(slot => `
        <button class="time-slot" data-time="${slot.time}" data-display="${slot.display}">
            ${slot.display}
        </button>
    `).join('');

    container.querySelectorAll('.time-slot').forEach(btn => {
        btn.addEventListener('click', () => selectTime(btn.dataset.time, btn.dataset.display));
    });

    // Re-select previously selected time if still available
    if (state.scheduling.selectedTime) {
        const existing = container.querySelector(`[data-time="${state.scheduling.selectedTime}"]`);
        if (existing) {
            existing.classList.add('selected');
        } else {
            state.scheduling.selectedTime = null;
            state.scheduling.selectedTimeDisplay = null;
        }
    }
}

function selectTime(time, display) {
    state.scheduling.selectedTime = time;
    state.scheduling.selectedTimeDisplay = display;

    // Update UI
    document.querySelectorAll('.time-slot.selected').forEach(s => s.classList.remove('selected'));
    document.querySelector(`.time-slot[data-time="${time}"]`)?.classList.add('selected');

    // Show client section
    document.getElementById('client-section').style.display = 'block';

    updateSchedulingSummary();
    updateBookingButtonState();
    saveState();
}

function initClientForm() {
    const nameInput = document.getElementById('client-name');
    const emailInput = document.getElementById('client-email');
    const phoneInput = document.getElementById('client-phone');

    // Restore saved values
    if (nameInput) nameInput.value = state.client.name || '';
    if (emailInput) emailInput.value = state.client.email || '';
    if (phoneInput) phoneInput.value = state.client.phone || '';

    const handleInput = () => {
        state.client.name = nameInput?.value || '';
        state.client.email = emailInput?.value || '';
        state.client.phone = phoneInput?.value || '';
        updateBookingButtonState();
        saveState();
    };

    nameInput?.addEventListener('input', handleInput);
    emailInput?.addEventListener('input', handleInput);
    phoneInput?.addEventListener('input', handleInput);
}

function updateSchedulingSummary() {
    // Visit type and duration
    const isInPerson = requiresInPersonVisit();
    document.getElementById('summary-visit-type').textContent = isInPerson ? 'In-Person Visit' : 'Virtual Visit';
    document.getElementById('summary-duration').textContent = estimateAppointmentTime().formatted;

    // Date and time
    const dateRow = document.getElementById('summary-date-row');
    const timeRow = document.getElementById('summary-time-row');
    const dateEl = document.getElementById('summary-date');
    const timeEl = document.getElementById('summary-time');

    if (state.scheduling.selectedDate) {
        dateRow.style.display = 'flex';
        dateEl.textContent = formatDateDisplay(state.scheduling.selectedDate);
    } else {
        dateRow.style.display = 'none';
    }

    if (state.scheduling.selectedTime) {
        timeRow.style.display = 'flex';
        timeEl.textContent = state.scheduling.selectedTimeDisplay;
    } else {
        timeRow.style.display = 'none';
    }

    // Pets list
    const petsContainer = document.getElementById('summary-pets');
    petsContainer.innerHTML = state.household.pets.map(pet => `
        <div class="summary-pet">
            <i class="ph ph-${pet.type}"></i>
            <span>${pet.name}</span>
        </div>
    `).join('');

    // Pricing
    const consultationFee = calculateConsultationFee();
    const lineItemCosts = calculateLineItemCosts();
    const travelFee = isInPerson ? PRICING.TRAVEL_FEE : 0;
    const total = consultationFee + lineItemCosts + travelFee;

    const consultationRow = document.getElementById('summary-consultation-row');
    const servicesRow = document.getElementById('summary-services-row');
    const travelRow = document.getElementById('summary-travel-row');

    if (consultationFee > 0) {
        consultationRow.style.display = 'flex';
        document.getElementById('summary-consultation-fee').textContent = `$${consultationFee}`;
    } else {
        consultationRow.style.display = 'none';
    }

    if (lineItemCosts > 0) {
        servicesRow.style.display = 'flex';
        document.getElementById('summary-services-fee').textContent = `$${lineItemCosts}`;
    } else {
        servicesRow.style.display = 'none';
    }

    if (travelFee > 0) {
        travelRow.style.display = 'flex';
        document.getElementById('summary-travel-fee').textContent = `$${travelFee}`;
    } else {
        travelRow.style.display = 'none';
    }

    document.getElementById('summary-total').textContent = `$${total}`;
}

function updateBookingButtonState() {
    const btn = document.getElementById('confirm-booking-btn');
    const hasDate = !!state.scheduling.selectedDate;
    const hasTime = !!state.scheduling.selectedTime;
    const hasName = !!state.client.name?.trim();
    const hasEmail = !!state.client.email?.trim() && isValidEmail(state.client.email);

    btn.disabled = !(hasDate && hasTime && hasName && hasEmail);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function initBookingButton() {
    const btn = document.getElementById('confirm-booking-btn');
    btn?.addEventListener('click', submitBooking);

    const bookAnotherBtn = document.getElementById('book-another-btn');
    bookAnotherBtn?.addEventListener('click', () => {
        // Reset scheduling state
        state.scheduling.selectedDate = null;
        state.scheduling.selectedTime = null;
        state.scheduling.selectedTimeDisplay = null;
        // Go back to services step
        goToStep(2);
    });
}

async function submitBooking() {
    const btn = document.getElementById('confirm-booking-btn');
    const errorEl = document.getElementById('booking-error');

    btn.disabled = true;
    btn.textContent = 'Booking...';
    errorEl.style.display = 'none';

    try {
        const isInPerson = requiresInPersonVisit();
        const consultationFee = calculateConsultationFee();
        const lineItemCosts = calculateLineItemCosts();
        const travelFee = isInPerson ? PRICING.TRAVEL_FEE : 0;
        const total = consultationFee + lineItemCosts + travelFee;

        const payload = {
            siteKey: LEVEE_CONFIG.siteKey,
            client: {
                name: state.client.name,
                email: state.client.email,
                phone: state.client.phone || undefined,
            },
            household: state.household.pets.map(pet => ({
                name: pet.name,
                species: pet.type,
                services: {
                    adviceTopics: pet.services.adviceTopics || [],
                    selectedIds: pet.services.selectedIds || [],
                    customConcerns: pet.services.customConcerns || [],
                }
            })),
            appointment: {
                date: state.scheduling.selectedDate,
                time: state.scheduling.selectedTime,
                visitType: isInPerson ? 'in-person' : 'virtual',
                durationMinutes: estimateAppointmentTime().minutes,
                notes: gatherAppointmentNotes(),
            },
            pricing: {
                consultationFee,
                lineItems: lineItemCosts,
                travelFee,
                total,
            }
        };

        const response = await fetch(`${LEVEE_CONFIG.apiUrl}/api/public/schedule`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Site-Key': LEVEE_CONFIG.siteKey,
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to book appointment');
        }

        // Success - show confirmation
        showConfirmation(data);

    } catch (error) {
        console.error('Booking error:', error);
        errorEl.textContent = error.message || 'Unable to complete booking. Please try again.';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Confirm Appointment';
    }
}

function gatherAppointmentNotes() {
    const notes = [];
    for (const pet of state.household.pets) {
        const petNotes = [];
        if (pet.services.adviceContext?.trim()) {
            petNotes.push(pet.services.adviceContext.trim());
        }
        if (petNotes.length > 0) {
            notes.push(`${pet.name}: ${petNotes.join('; ')}`);
        }
    }
    return notes.join('\n');
}

function showConfirmation(data) {
    // Hide scheduling step dots after step 3
    document.querySelectorAll('.step-dot').forEach((dot, i) => {
        if (i === 3) dot.classList.add('completed');
    });

    // Go to confirmation step (step 4 in UI but index 4)
    document.querySelectorAll('.estimator-step').forEach((step, i) => {
        step.classList.toggle('active', i === 4);
    });

    // Populate confirmation details
    document.getElementById('confirmation-code').textContent = data.confirmationCode;
    document.getElementById('confirmation-message').textContent = data.message;
    document.getElementById('confirmation-email').textContent = state.client.email;

    // Calendar links
    if (data.calendarLinks) {
        document.getElementById('add-to-google').href = data.calendarLinks.googleCalendar;
        document.getElementById('download-ics').href = data.calendarLinks.icsDownload;
    }

    // Clear the scheduling state
    state.scheduling.selectedDate = null;
    state.scheduling.selectedTime = null;
    state.scheduling.selectedTimeDisplay = null;
    saveState();
}

// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Load saved state
    loadState();

    // UI effects
    initParallax();
    initScrollAnimations();
    initNavbarScroll();
    initMobileMenu();
    initSchedulingButton();

    // Core functionality
    initPetManagement();
    initWizard();

    // If returning with pets, render them
    if (state.household.pets.length > 0) {
        renderPetCards();
    }
});
