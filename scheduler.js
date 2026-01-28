/**
 * Levee Scheduler Plugin
 *
 * Ported from everyday.vet scheduler for use with booking tokens.
 * When user completes the flow, saves data to booking token and redirects to book.html.
 */

// =============================================================================
// TOKEN STATE ADAPTER
// =============================================================================

const TokenStateAdapter = {
    token: null,
    tokenData: null,

    async init() {
        const params = new URLSearchParams(window.location.search);
        this.token = params.get('token');

        if (this.token) {
            try {
                const response = await fetch(`/api/public/validate-token?token=${encodeURIComponent(this.token)}`);
                if (response.ok) {
                    this.tokenData = await response.json();
                    return this.tokenData;
                }
            } catch (error) {
                console.error('Failed to validate token:', error);
            }
        }
        return null;
    },

    async saveToToken(schedulerData) {
        if (!this.token) {
            console.error('No token available');
            return false;
        }

        try {
            const response = await fetch('/api/public/update-scheduler-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: this.token,
                    schedulerData,
                }),
            });
            return response.ok;
        } catch (error) {
            console.error('Failed to save scheduler data:', error);
            return false;
        }
    },

    getBookingUrl() {
        return `/book.html?token=${encodeURIComponent(this.token)}`;
    }
};

// =============================================================================
// SCHEDULER MODULE
// =============================================================================

const Scheduler = (function() {
    const stateAdapter = TokenStateAdapter;

    // State
    const state = {
        household: {
            pets: [],
            isNewClient: null,
        },
        currentPetId: null,
        currentStep: 'address', // 'address', 'pets', 'book', 'services'
        client: {
            name: '',
            email: '',
            phone: '',
            address: '',
        },
    };

    // Pricing
    const PRICING = {
        ADVICE_BASE: 75,
        ADVICE_PER_ADDITIONAL_PET: 10,
        TRAVEL_FEE: 100,
    };

    // =============================================================================
    // STATE MANAGEMENT
    // =============================================================================

    const SESSION_STORAGE_KEY = 'levee_scheduler_state';

    function saveStateToSession() {
        // Save state to sessionStorage to preserve progress on page refresh
        try {
            const stateToSave = {
                household: state.household,
                currentPetId: state.currentPetId,
                currentStep: state.currentStep,
                client: state.client,
            };
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (e) {
            console.warn('Could not save state to sessionStorage:', e);
        }
    }

    function loadStateFromSession() {
        try {
            const sessionData = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (sessionData) {
                const parsed = JSON.parse(sessionData);
                if (parsed.household?.pets) {
                    state.household.pets = parsed.household.pets;
                    state.household.isNewClient = parsed.household.isNewClient ?? null;
                }
                state.currentPetId = parsed.currentPetId || (state.household.pets[0]?.id ?? null);
                state.currentStep = parsed.currentStep ?? 'address';
                if (parsed.client) {
                    state.client = { ...state.client, ...parsed.client };
                }
                return true;
            }
        } catch (e) {
            console.warn('Could not load state from sessionStorage:', e);
        }
        return false;
    }

    function clearSessionState() {
        try {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch (e) {
            // Ignore errors
        }
    }

    function loadStateFromToken(tokenData) {
        if (!tokenData) return false;

        // If token has existing patient data, pre-populate
        if (tokenData.patients && tokenData.patients.length > 0) {
            state.household.pets = tokenData.patients.map((p, i) => ({
                id: Date.now() + i,
                name: p.name,
                type: p.species || 'dog',
                ownerName: p.ownerName || null,
                services: { selectedIds: [], adviceTopics: [], adviceContext: '', customConcerns: [] }
            }));
            state.currentPetId = state.household.pets[0]?.id || null;
        }

        // Set client info if available
        if (tokenData.client) {
            state.client.name = tokenData.client.name || '';
            state.client.phone = tokenData.client.phone || '';
            state.client.address = tokenData.client.address || '';
        }

        // New clients (never had an appointment) start fresh, returning clients go to services
        // Having pets but no completed appointments = still a "new client"
        state.household.isNewClient = !tokenData.hasCompletedAppointments;

        return state.household.pets.length > 0;
    }

    function savePetSelections() {
        if (!state.currentPetId) return;

        const pet = state.household.pets.find(p => p.id === state.currentPetId);
        if (!pet) return;

        const checkboxes = document.querySelectorAll('.service-checkbox input:checked, .single-toggle-checkbox input:checked');
        pet.services.selectedIds = Array.from(checkboxes).map(cb => cb.value);

        const getTopics = window.getAdviceTopics_advice;
        const getContext = window.getAdviceContext_advice;
        pet.services.adviceTopics = getTopics ? getTopics() : [];
        pet.services.adviceContext = getContext ? getContext() : '';
        pet.services.customConcerns = window.getCustomConcerns ? window.getCustomConcerns() : [];

        saveStateToSession();
    }

    // =============================================================================
    // PRICING LOGIC
    // =============================================================================

    function calculateConsultationFee() {
        if (!hasAnyAdviceSelected()) return 0;
        const numPets = Math.max(state.household.pets.length, 1);
        return PRICING.ADVICE_BASE + ((numPets - 1) * PRICING.ADVICE_PER_ADDITIONAL_PET);
    }

    function hasAnyAdviceSelected() {
        for (const pet of state.household.pets) {
            if (pet.services.adviceTopics?.length > 0) return true;
            if (pet.services.adviceContext?.trim()) return true;
            if (pet.services.customConcerns?.length > 0) return true;
        }
        return false;
    }

    function calculateLineItemCosts() {
        let total = 0;
        for (const pet of state.household.pets) {
            for (const serviceId of (pet.services.selectedIds || [])) {
                total += getServiceCost(serviceId);
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

    function requiresInPersonVisit() {
        for (const pet of state.household.pets) {
            for (const serviceId of (pet.services.selectedIds || [])) {
                if (isServiceInPerson(serviceId)) return true;
            }
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
                if (item) return (item.type || category.defaultType) === 'in-person';
            }
            if (category.item?.id === serviceId) {
                return category.defaultType === 'in-person';
            }
        }
        return false;
    }

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
    // TIME ESTIMATION
    // =============================================================================

    function estimateAppointmentTime() {
        const data = gatherAppointmentData();
        let minutes = 5;
        let reasoning = [];

        const totalTopics = data.adviceTopics.length + data.customConcerns.length;
        if (totalTopics > 0) {
            let discussionTime = 15;
            if (totalTopics > 1) {
                const tier1 = Math.min(totalTopics - 1, 2);
                const tier2 = Math.min(Math.max(totalTopics - 3, 0), 3);
                const tier3 = Math.max(totalTopics - 6, 0);
                discussionTime += (tier1 * 3) + (tier2 * 2) + (tier3 * 1);
            }
            minutes += discussionTime;
            reasoning.push(`Discussion: ~${discussionTime} min`);
        }

        if (data.physicalExam === 'comprehensive') {
            minutes += 15;
            reasoning.push('Comprehensive exam: ~15 min');
        } else if (data.physicalExam === 'quick') {
            minutes += 5;
            reasoning.push('Quick exam: ~5 min');
        }

        if (data.vaccines.length > 0) {
            minutes += 6;
            reasoning.push(`Vaccines (${data.vaccines.length}): ~6 min`);
        }

        if (data.labs.length > 0) {
            const labTime = Math.min(data.labs.length * 4, 12);
            minutes += labTime;
            reasoning.push(`Lab collection: ~${labTime} min`);
        }

        if (data.procedures.length > 0) {
            let procTime = data.procedures.reduce((sum, p) => sum + (p.time || 10), 0);
            if (data.procedures.length > 1) procTime = Math.round(procTime * 0.85);
            minutes += procTime;
            reasoning.push(`Procedures: ~${procTime} min`);
        }

        if (data.petsWithServices > 1) {
            const additionalTime = Math.round((minutes - 5) * 0.65 * (data.petsWithServices - 1));
            minutes += additionalTime;
            reasoning.push(`Additional pets: ~${additionalTime} min`);
        }

        minutes = Math.max(15, Math.round(minutes / 5) * 5);

        return {
            minutes,
            formatted: formatDuration(minutes),
            reasoning: reasoning.join(' | ')
        };
    }

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

            if (pet.services.adviceTopics?.length > 0) {
                data.adviceTopics.push(...pet.services.adviceTopics);
                petHasServices = true;
            }

            if (pet.services.customConcerns?.length > 0) {
                data.customConcerns.push(...pet.services.customConcerns);
                petHasServices = true;
            }

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

    function getServiceInfo(serviceId) {
        for (const category of SERVICES_CONFIG.categories) {
            if (category.item?.id === serviceId) {
                return { id: serviceId, label: category.item.label, time: category.item.time || 10, group: category.id };
            }
            if (category.items) {
                const item = category.items.find(i => i.id === serviceId);
                if (item) {
                    return { id: serviceId, label: item.label, time: item.time || 10, group: category.id };
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

        if (!steps.length) return;

        // Use event delegation for step dots (they get re-rendered dynamically)
        const stepProgress = document.getElementById('step-progress');
        if (stepProgress) {
            stepProgress.addEventListener('click', (e) => {
                const dot = e.target.closest('.step-dot');
                if (!dot) return;

                const targetStep = dot.dataset.step;
                const stepOrder = getStepOrder();
                const currentIndex = stepOrder.indexOf(state.currentStep);
                const targetIndex = stepOrder.indexOf(targetStep);
                // Only allow going back to previous steps
                if (targetIndex < currentIndex) {
                    goToStep(targetStep);
                }
            });
        }

        // Address step: Continue to pets
        document.getElementById('address-continue-btn')?.addEventListener('click', () => {
            const streetInput = document.getElementById('client-street-address');
            const unitInput = document.getElementById('client-unit-number');
            const street = streetInput?.value?.trim() || '';
            const unit = unitInput?.value?.trim() || '';
            state.client.address = unit ? `${street}, ${unit}` : street;
            goToStep('pets');
        });

        // Address input validation
        const streetInput = document.getElementById('client-street-address');
        const addressContinueBtn = document.getElementById('address-continue-btn');
        streetInput?.addEventListener('input', () => {
            const hasAddress = streetInput.value.trim().length >= 5;
            if (addressContinueBtn) addressContinueBtn.disabled = !hasAddress;
        });
        streetInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !addressContinueBtn?.disabled) {
                addressContinueBtn?.click();
            }
        });

        // New client: After adding pets, go directly to simplified booking
        document.getElementById('household-continue-btn')?.addEventListener('click', () => {
            if (state.household.pets.length > 0) {
                // New clients go to simplified new client content (virtual consultation only)
                state.household.isNewClient = true;
                goToStep('book'); // Show new client booking step
            }
        });

        // These buttons are no longer needed in the simplified flow
        // but keep handlers in case the UI still has them
        document.getElementById('btn-new-customer')?.addEventListener('click', () => {
            state.household.isNewClient = true;
            showClientTypeContent();
            goToStep('services');
        });

        document.getElementById('btn-existing-customer')?.addEventListener('click', () => {
            state.household.isNewClient = false;
            showClientTypeContent();
            goToStep('services');
        });

        initSchedulingButton();

        // SIMPLIFIED FLOW based on phone-first approach:
        // - Existing clients (hasPets): Go directly to services
        // - New clients (no pets): Start at address step
        if (state.household.isNewClient === false && state.household.pets.length > 0) {
            // EXISTING CLIENT: Skip to services with pets pre-filled
            updateStepProgressForExistingClient();
            renderPetCards();
            updateHouseholdStepUI();
            state.currentPetId = state.currentPetId || state.household.pets[0]?.id || null;
            // Respect restored step, default to services
            const targetStep = state.currentStep || 'services';
            goToStep(targetStep);
        } else {
            // NEW CLIENT: Start at address step or restore previous step
            state.household.isNewClient = true;
            updateStepProgressForNewClient();
            // Pre-fill address if we have it
            if (state.client.address) {
                const streetInput = document.getElementById('client-street-address');
                if (streetInput) {
                    streetInput.value = state.client.address;
                    const addressContinueBtn = document.getElementById('address-continue-btn');
                    if (addressContinueBtn) addressContinueBtn.disabled = false;
                }
            }
            // Respect restored step for new clients, default to address
            const targetStep = state.currentStep || 'address';
            // Only 'book' step requires pets - 'pets' step is fine without pets (user is adding them)
            if (targetStep === 'book' && state.household.pets.length === 0) {
                goToStep('pets');
            } else {
                goToStep(targetStep);
            }
        }
    }

    function getStepOrder() {
        if (state.household.isNewClient) {
            return ['address', 'pets', 'book'];
        } else {
            return ['services', 'book'];
        }
    }

    function updateStepProgressForNewClient() {
        const stepProgress = document.getElementById('step-progress');
        if (!stepProgress) return;

        stepProgress.innerHTML = `
            <div class="step-dot active" data-step="address">
                <span class="step-number">1</span>
                <span class="step-label">Address</span>
            </div>
            <div class="step-connector"></div>
            <div class="step-dot" data-step="pets">
                <span class="step-number">2</span>
                <span class="step-label">Your Pets</span>
            </div>
            <div class="step-connector"></div>
            <div class="step-dot" data-step="book">
                <span class="step-number">3</span>
                <span class="step-label">Book</span>
            </div>
        `;
    }

    function updateStepProgressForExistingClient() {
        const stepProgress = document.getElementById('step-progress');
        if (!stepProgress) return;

        // For existing clients, show only 2 steps: Services → Book
        stepProgress.innerHTML = `
            <div class="step-dot active" data-step="services">
                <span class="step-number">1</span>
                <span class="step-label">Services</span>
            </div>
            <div class="step-connector"></div>
            <div class="step-dot" data-step="book">
                <span class="step-number">2</span>
                <span class="step-label">Book</span>
            </div>
        `;
    }

    function canProceedFromStep(step) {
        if (step === 'address') return true;
        if (step === 'pets') return state.household.pets.length > 0;
        return true;
    }

    function goToStep(stepName) {
        if (state.currentStep === 'services' && stepName !== 'services') {
            savePetSelections();
        }

        state.currentStep = stepName;

        // Update step content visibility based on step name
        document.querySelectorAll('.estimator-step').forEach((step) => {
            const dataStep = step.dataset.step;
            step.classList.toggle('active', dataStep === stepName);
        });

        // Update step dots based on client type
        updateStepDots(stepName);

        if (stepName === 'address') {
            // Address step: Focus input
            const streetInput = document.getElementById('client-street-address');
            streetInput?.focus();
        } else if (stepName === 'pets') {
            // Pets step: Update household UI
            updateHouseholdStepUI();
        } else if (stepName === 'book') {
            // Book step: New client simplified booking (virtual consultation only)
            updateNewClientPricing();
            showNewClientBooking();
            // Save pet data to server when reaching book step (capture leads)
            saveSchedulerDataToServer();
        } else if (stepName === 'services') {
            // Services step (existing clients)
            showServicesContent();
            if (state.household.pets.length > 0) {
                selectPet(state.currentPetId || state.household.pets[0].id);
            }
            // Save pet data to server when reaching services step (capture leads)
            saveSchedulerDataToServer();
        }

        // Save state to sessionStorage for refresh persistence
        saveStateToSession();
    }

    // Save scheduler data to server to capture leads at each step
    async function saveSchedulerDataToServer() {
        if (state.household.pets.length === 0) return;

        const isInPerson = state.household.isNewClient
            ? document.getElementById('onboarding-inperson')?.checked
            : requiresInPersonVisit();

        const schedulerData = {
            household: state.household.pets.map(pet => ({
                name: pet.name,
                species: pet.type,
                sex: pet.sex || null,
                services: {
                    adviceTopics: pet.services?.adviceTopics || [],
                    selectedIds: pet.services?.selectedIds || [],
                    customConcerns: pet.services?.customConcerns || [],
                    adviceContext: pet.services?.adviceContext || '',
                }
            })),
            visitType: isInPerson ? 'in-person' : 'virtual',
            durationMinutes: 30, // Default estimate
            isNewClient: state.household.isNewClient ?? true,
            pricing: { consultationFee: 0, lineItems: 0, travelFee: 0, total: 0 }, // Preliminary
        };

        console.log('[Scheduler] Auto-saving pet data to server:', schedulerData.household.map(p => ({ name: p.name, sex: p.sex })));

        try {
            await stateAdapter.saveToToken(schedulerData);
        } catch (error) {
            console.error('[Scheduler] Failed to auto-save:', error);
        }
    }

    function updateStepDots(currentStep) {
        const dots = document.querySelectorAll('.step-dot');
        const stepOrder = getStepOrder();
        const currentIndex = stepOrder.indexOf(currentStep);

        dots.forEach((dot) => {
            const dotStep = dot.dataset.step;
            const dotIndex = stepOrder.indexOf(dotStep);
            dot.classList.toggle('active', dotStep === currentStep);
            dot.classList.toggle('completed', dotIndex !== -1 && dotIndex < currentIndex);
        });
    }

    function showNewClientBooking() {
        // For new clients: show simplified booking (virtual consultation only)
        const newContent = document.getElementById('new-customer-content');
        const existingContent = document.getElementById('existing-customer-content');

        if (newContent) newContent.style.display = 'block';
        if (existingContent) existingContent.style.display = 'none';
    }

    function showServicesContent() {
        // For existing clients: show full services selection
        const existingContent = document.getElementById('existing-customer-content');
        if (existingContent) existingContent.style.display = 'block';
    }

    // Keep for backwards compatibility
    function showClientTypeContent() {
        if (state.household.isNewClient) {
            showNewClientBooking();
        } else {
            showServicesContent();
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
        const sexInput = document.getElementById('pet-sex-input');
        const fixedInput = document.getElementById('pet-fixed-input');
        const cancelBtn = document.getElementById('pet-modal-cancel');
        const confirmBtn = document.getElementById('pet-modal-add');

        if (!addBtn || !modal) return;

        let selectedType = null;
        let editingPetId = null; // Track if we're editing

        const modalTitle = modal.querySelector('.modal-header h3');

        function openModal(pet = null) {
            editingPetId = pet ? pet.id : null;
            modal.style.display = 'flex';

            if (pet) {
                // Edit mode - pre-fill values
                if (modalTitle) modalTitle.textContent = 'Edit Pet';
                confirmBtn.textContent = 'Save Changes';
                nameInput.value = pet.name;
                selectedType = pet.type;
                typeButtons.forEach(b => {
                    b.classList.toggle('selected', b.dataset.type === pet.type);
                });
                // Pre-fill sex fields based on stored sex value
                if (sexInput) {
                    if (pet.sex === 'male' || pet.sex === 'neutered') {
                        sexInput.value = 'male';
                    } else if (pet.sex === 'female' || pet.sex === 'spayed') {
                        sexInput.value = 'female';
                    } else {
                        sexInput.value = '';
                    }
                }
                if (fixedInput) {
                    if (pet.sex === 'neutered' || pet.sex === 'spayed') {
                        fixedInput.value = 'yes';
                    } else if (pet.sex === 'male' || pet.sex === 'female') {
                        fixedInput.value = 'no';
                    } else {
                        fixedInput.value = '';
                    }
                }
                confirmBtn.disabled = false;
            } else {
                // Add mode - clear values
                if (modalTitle) modalTitle.textContent = 'Add a Pet';
                confirmBtn.textContent = 'Add Pet';
                nameInput.value = '';
                selectedType = null;
                typeButtons.forEach(b => b.classList.remove('selected'));
                if (sexInput) sexInput.value = '';
                if (fixedInput) fixedInput.value = '';
                confirmBtn.disabled = true;
            }
            nameInput.focus();
        }

        // Expose openModal for editing from pet cards
        window.openPetModal = openModal;

        addBtn.addEventListener('click', () => openModal(null));

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

            // Compute sex value from sex and fixed inputs
            const sexValue = sexInput ? sexInput.value : '';
            const fixedValue = fixedInput ? fixedInput.value : '';
            let sex = null;
            if (sexValue === 'male') {
                sex = fixedValue === 'yes' ? 'neutered' : 'male';
            } else if (sexValue === 'female') {
                sex = fixedValue === 'yes' ? 'spayed' : 'female';
            }

            if (editingPetId) {
                // Update existing pet
                updatePet(editingPetId, name, selectedType, sex);
            } else {
                // Add new pet
                addPet(name, selectedType, sex);
            }
            modal.style.display = 'none';
        });
    }

    function addPet(name, type, sex = null) {
        const pet = {
            id: Date.now(),
            name,
            type,
            sex,
            services: { selectedIds: [], adviceTopics: [], adviceContext: '', customConcerns: [] }
        };

        state.household.pets.push(pet);
        renderPetCards();
        selectPet(pet.id);
        updateHouseholdStepUI();
        saveStateToSession();
    }

    function updatePet(petId, name, type, sex) {
        const pet = state.household.pets.find(p => p.id === petId);
        if (!pet) return;

        pet.name = name;
        pet.type = type;
        pet.sex = sex;

        renderPetCards();
        updateHouseholdStepUI();
        saveStateToSession();
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
            const section = document.getElementById('pet-services-section');
            if (section) section.style.display = 'none';
            updateEstimateDisplay();
        }

        updateHouseholdStepUI();
        saveStateToSession();
    }

    function selectPet(petId) {
        if (state.currentPetId && state.currentPetId !== petId) {
            savePetSelections();
        }

        state.currentPetId = petId;
        renderPetCards();

        const pet = state.household.pets.find(p => p.id === petId);
        if (!pet) return;

        const nameEl = document.getElementById('current-pet-name');
        if (nameEl) nameEl.textContent = pet.name;

        const servicesSection = document.getElementById('pet-services-section');
        if (servicesSection) servicesSection.style.display = 'block';

        renderServiceCategories(pet.type);
        initAccordions();
        initEstimator();
        restorePetSelections(pet);
        updateEstimateDisplay();
    }

    function restorePetSelections(pet) {
        document.querySelectorAll('.service-checkbox input, .single-toggle-checkbox input').forEach(cb => {
            cb.checked = pet.services.selectedIds?.includes(cb.value) || false;
        });

        const setTopics = window.setAdviceTopics_advice;
        const setContext = window.setAdviceContext_advice;
        if (setTopics) setTopics(pet.services.adviceTopics || []);
        if (setContext) setContext(pet.services.adviceContext || '');

        if (window.setCustomConcerns) {
            window.setCustomConcerns(pet.services.customConcerns || []);
        }

        document.querySelectorAll('.category-accordion').forEach(updateAccordionState);
    }

    function renderPetCards() {
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
                        // Open edit modal when clicking on pet
                        if (window.openPetModal) {
                            window.openPetModal(pet);
                        }
                    }
                });

                if (addBtn) {
                    householdContainer.insertBefore(tab, addBtn);
                } else {
                    householdContainer.appendChild(tab);
                }
            });
        }

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
        if (continueBtn) continueBtn.disabled = state.household.pets.length === 0;
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

            header.addEventListener('click', () => accordion.classList.toggle('expanded'));

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

        if (isVaccines && checked.length > 0) {
            html += `
                <span class="service-chiclet chiclet-free" title="A quick examination is included free with vaccinations.">
                    <span class="chiclet-label">Free Quick Exam</span>
                </span>
            `;
        }

        checked.forEach(cb => {
            const label = cb.closest('.service-checkbox')?.querySelector('.checkbox-label')?.textContent || cb.value;
            html += `
                <span class="service-chiclet" data-service-id="${cb.value}">
                    <span class="chiclet-label">${label}</span>
                    <span class="chiclet-remove"><i class="ph ph-x"></i></span>
                </span>
            `;
        });

        customConcerns.forEach(c => {
            html += `
                <span class="service-chiclet" data-concern-label="${c.label}">
                    <span class="chiclet-label">${c.label}</span>
                    <span class="chiclet-remove"><i class="ph ph-x"></i></span>
                </span>
            `;
        });

        adviceTopics.forEach(t => {
            html += `
                <span class="service-chiclet" data-topic="${t}">
                    <span class="chiclet-label">${t}</span>
                    <span class="chiclet-remove"><i class="ph ph-x"></i></span>
                </span>
            `;
        });

        container.innerHTML = html;

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
        document.querySelectorAll('.service-checkbox input, .single-toggle-checkbox input').forEach(cb => {
            cb.addEventListener('change', () => {
                savePetSelections();
                updateEstimateDisplay();
            });
        });

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
            if (resultEmpty) resultEmpty.style.display = 'block';
            if (resultContent) resultContent.style.display = 'none';
            return;
        }

        if (resultEmpty) resultEmpty.style.display = 'none';
        if (resultContent) resultContent.style.display = 'block';

        const isInPerson = requiresInPersonVisit();
        const visitTypeEl = document.getElementById('visit-type-value');
        const visitLocEl = document.getElementById('visit-type-location');
        if (visitTypeEl) visitTypeEl.textContent = isInPerson ? 'In-Person Visit' : 'Virtual Visit';
        if (visitLocEl) visitLocEl.textContent = isInPerson ? 'Greater Cleveland Area' : 'Anywhere in Ohio';

        const timeEstimate = estimateAppointmentTime();
        const durationEl = document.getElementById('duration-display');
        if (durationEl) durationEl.textContent = timeEstimate.formatted;
        const reasoning = document.getElementById('duration-reasoning');
        if (reasoning) {
            reasoning.textContent = timeEstimate.reasoning;
            reasoning.style.display = timeEstimate.reasoning ? 'block' : 'none';
        }

        const consultationFee = calculateConsultationFee();
        const lineItemCosts = calculateLineItemCosts();
        const travelFee = isInPerson ? PRICING.TRAVEL_FEE : 0;
        const total = consultationFee + lineItemCosts + travelFee;

        const consultationLine = document.getElementById('consultation-fee-line');
        const consultationLabel = document.getElementById('consultation-label');
        const consultationFeeEl = document.getElementById('consultation-fee');

        if (consultationFee > 0 && consultationLine) {
            consultationLine.style.display = 'flex';
            const numPets = state.household.pets.length;
            if (consultationLabel) consultationLabel.textContent = numPets > 1 ? `Advice & Guidance (${numPets} pets)` : 'Advice & Guidance';
            if (consultationFeeEl) consultationFeeEl.textContent = `$${consultationFee}`;
        } else if (consultationLine) {
            consultationLine.style.display = 'none';
        }

        const itemizedLine = document.getElementById('itemized-fee-line');
        const itemizedFeeEl = document.getElementById('itemized-fee');
        if (lineItemCosts > 0 && itemizedLine) {
            itemizedLine.style.display = 'flex';
            if (itemizedFeeEl) itemizedFeeEl.textContent = `$${lineItemCosts}`;
        } else if (itemizedLine) {
            itemizedLine.style.display = 'none';
        }

        const travelLine = document.getElementById('travel-fee-line');
        const travelFeeEl = document.getElementById('travel-fee');
        if (travelFee > 0 && travelLine) {
            travelLine.style.display = 'flex';
            if (travelFeeEl) travelFeeEl.textContent = `$${travelFee}`;
        } else if (travelLine) {
            travelLine.style.display = 'none';
        }

        const totalEl = document.getElementById('total-price');
        if (totalEl) totalEl.textContent = `$${total}`;
    }

    // =============================================================================
    // AUTOCOMPLETE: CUSTOM CONCERNS
    // =============================================================================

    const veterinaryConcerns = [
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
        { label: 'Nail trim', type: 'in-person', time: 10 },
        { label: 'Anal gland expression', type: 'in-person', time: 10 },
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
                                 c.type === 'in-person' ? 'Requires in-person visit' : 'Not available';
                return `
                    <div class="autocomplete-item" data-index="${i}">
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
            if (item) selectConcern(filterConcerns(input.value)[parseInt(item.dataset.index)]);
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
            if (item) selectTopic(filterTopics(input.value)[parseInt(item.dataset.index)]);
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
    // SCHEDULING BUTTON & REDIRECT TO BOOK.HTML
    // =============================================================================

    function initSchedulingButton() {
        const btn = document.getElementById('continue-to-scheduling-btn');
        btn?.addEventListener('click', async () => {
            savePetSelections();
            await saveAndRedirectToBooking(btn, false);
        });

        const newClientBtn = document.getElementById('book-first-visit-btn');
        newClientBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            await saveAndRedirectToBooking(newClientBtn, true);
        });

        window.addEventListener('pageshow', () => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Continue to Scheduling';
            }
            if (newClientBtn) {
                newClientBtn.disabled = false;
                newClientBtn.innerHTML = 'Book Your First Visit';
            }
        });
    }

    async function saveAndRedirectToBooking(btn, isNewClientParam = null) {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner"></span> Saving...';

        try {
            const newClient = isNewClientParam !== null ? isNewClientParam : state.household.isNewClient;
            const isInPerson = newClient
                ? document.getElementById('onboarding-inperson')?.checked
                : requiresInPersonVisit();

            let consultationFee, lineItemCosts, travelFee, total;

            if (newClient) {
                const numPets = state.household.pets.length;
                consultationFee = PRICING.ADVICE_BASE + ((numPets - 1) * PRICING.ADVICE_PER_ADDITIONAL_PET);
                lineItemCosts = 0;
                travelFee = isInPerson ? PRICING.TRAVEL_FEE : 0;
                total = consultationFee + travelFee;
            } else {
                consultationFee = calculateConsultationFee();
                lineItemCosts = calculateLineItemCosts();
                travelFee = isInPerson ? PRICING.TRAVEL_FEE : 0;
                total = consultationFee + lineItemCosts + travelFee;
            }

            const schedulerData = {
                household: state.household.pets.map(pet => ({
                    name: pet.name,
                    species: pet.type,
                    sex: pet.sex || null,
                    services: {
                        adviceTopics: pet.services?.adviceTopics || [],
                        selectedIds: pet.services?.selectedIds || [],
                        customConcerns: pet.services?.customConcerns || [],
                        adviceContext: pet.services?.adviceContext || '',
                    }
                })),
                visitType: isInPerson ? 'in-person' : 'virtual',
                durationMinutes: estimateAppointmentTime().minutes,
                isNewClient: newClient,
                pricing: { consultationFee, lineItems: lineItemCosts, travelFee, total },
            };

            // Debug: Log scheduler data being sent
            console.log('[Scheduler] Saving to token:', JSON.stringify(schedulerData, null, 2));
            console.log('[Scheduler] Pet sex values:', state.household.pets.map(p => ({ name: p.name, sex: p.sex })));

            // Save scheduler data to token
            const saved = await stateAdapter.saveToToken(schedulerData);
            if (!saved) {
                throw new Error('Failed to save scheduler data');
            }

            // Redirect to book.html with token
            window.location.href = stateAdapter.getBookingUrl();

        } catch (error) {
            console.error('Error saving scheduler data:', error);
            btn.disabled = false;
            btn.textContent = originalText;
            alert('Unable to proceed. Please try again.');
        }
    }

    // =============================================================================
    // PUBLIC API
    // =============================================================================

    function personalizeHeading() {
        const heading = document.getElementById('household-heading');
        const subtitle = document.getElementById('household-subtitle');
        if (!heading || !subtitle) return;

        const firstName = state.client.name?.split(' ')[0];
        if (firstName) {
            if (state.household.isNewClient) {
                // New client - first time booking
                heading.textContent = `Hi ${firstName}!`;
                subtitle.textContent = `Let's get to know your pets. Add each one you'd like us to see.`;
            } else {
                // Returning client - has completed appointments before
                heading.textContent = `Welcome back, ${firstName}!`;
                subtitle.textContent = `Select the pets you'd like us to see during this visit.`;
            }
        }
    }

    return {
        async init() {
            // Initialize token state adapter
            const tokenData = await stateAdapter.init();

            // Try to restore from sessionStorage first (preserves progress on refresh)
            const hasSessionState = loadStateFromSession();

            // Load state from token if available (but don't overwrite session progress)
            if (tokenData && !hasSessionState) {
                loadStateFromToken(tokenData);
                personalizeHeading();
            } else if (tokenData && hasSessionState) {
                // Merge token data with session state (keep session progress, update token info)
                if (tokenData.client) {
                    state.client.name = state.client.name || tokenData.client.name || '';
                    state.client.phone = state.client.phone || tokenData.client.phone || '';
                    state.client.address = state.client.address || tokenData.client.address || '';
                }
                personalizeHeading();
            }

            // Initialize UI
            initPetManagement();
            initWizard();

            if (state.household.pets.length > 0) {
                renderPetCards();
            }
        },

        getState: () => state,
    };
})();

window.Scheduler = Scheduler;
