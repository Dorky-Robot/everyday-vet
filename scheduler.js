/**
 * Everyday Vet - Unified Scheduling System
 *
 * Shared module for both embedded (index.html) and standalone (schedule.html) schedulers.
 * Uses phone-first flow: users enter phone → receive SMS with booking link from Levee.
 */

// =============================================================================
// URL STATE ADAPTER
// =============================================================================

const UrlStateAdapter = {
    decode(encoded) {
        try {
            const json = decodeURIComponent(atob(encoded).split('').map(c =>
                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
            ).join(''));
            return JSON.parse(json);
        } catch {
            return null;
        }
    },

    load() {
        const params = new URLSearchParams(window.location.search);
        const encodedState = params.get('s');
        if (encodedState) {
            return this.decode(encodedState);
        }
        return null;
    },

    clear() {
        history.replaceState(null, '', window.location.pathname);
    }
};

// =============================================================================
// SCHEDULER MODULE
// =============================================================================

const Scheduler = (function() {
    // Configuration
    const stateAdapter = UrlStateAdapter;
    let isStandalone = false;

    // Levee API configuration
    const isLocalDev = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.protocol === 'file:';

    // Levee API configuration
    // - Local: localhost:3333 (via docker-compose + local server)
    // - Production: https://levee.everyday.vet (Render)
    const LEVEE_CONFIG = {
        apiUrl: isLocalDev ? 'http://localhost:3333' : 'https://levee.everyday.vet',
        siteKey: isLocalDev ? 'evv_everyday_vet_dev' : 'evv_everyday_vet',
        apiKey: isLocalDev ? 'evv_sk_dev_everyday_vet_2024' : '', // Not used client-side in prod
        // reCAPTCHA v3 site key (test key for dev, real key for prod)
        recaptchaSiteKey: isLocalDev
            ? '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'  // Google test key
            : '6LfXdFIsAAAAAP-h2N5dXnIQSbztWPQa3VRr8iBV', // Production key
    };

    // State
    const state = {
        household: {
            pets: [],
            isNewClient: null,
        },
        currentPetId: null,
        currentStep: 0,
        client: {
            name: '',
            email: '',
            phone: '',
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

    const SESSION_STORAGE_KEY = 'everydayvet_scheduler_state';

    function saveState() {
        // Save state to sessionStorage to preserve progress on page refresh
        try {
            const stateToSave = {
                household: state.household,
                currentPetId: state.currentPetId,
                currentStep: state.currentStep,
                client: state.client,
            };
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stateToSave));
        } catch {
            // sessionStorage unavailable
        }
    }

    function loadState() {
        // First try URL params (for booking links)
        const saved = stateAdapter.load();
        if (saved) {
            if (saved.household?.pets) {
                state.household.pets = saved.household.pets;
                state.household.isNewClient = saved.household.isNewClient ?? null;
            } else if (saved.pets) {
                state.household.pets = saved.pets;
                state.household.isNewClient = saved.isNewClient ?? null;
            }

            state.currentPetId = saved.currentPetId || (state.household.pets[0]?.id ?? null);
            state.currentStep = saved.currentStep ?? saved.step ?? 0;
            if (saved.client) state.client = { ...state.client, ...saved.client };

            return state.household.pets.length > 0;
        }

        // Fall back to sessionStorage (preserves state on refresh)
        try {
            const sessionData = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (sessionData) {
                const parsed = JSON.parse(sessionData);
                if (parsed.household?.pets) {
                    state.household.pets = parsed.household.pets;
                    state.household.isNewClient = parsed.household.isNewClient ?? null;
                }
                state.currentPetId = parsed.currentPetId || (state.household.pets[0]?.id ?? null);
                state.currentStep = parsed.currentStep ?? 0;
                if (parsed.client) state.client = { ...state.client, ...parsed.client };

                return state.household.pets.length > 0 || state.currentStep > 0;
            }
        } catch {
            // sessionStorage unavailable
        }

        return false;
    }

    function clearState() {
        state.household.pets = [];
        state.household.isNewClient = null;
        state.currentPetId = null;
        state.currentStep = 0;
        state.client = { name: '', email: '', phone: '' };
        stateAdapter.clear();
        try {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch (e) {
            // Ignore errors
        }
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

        saveState(); // Save immediately to persist service selections
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
        let minutes = 5; // Base setup
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
            reasoning: reasoning.join(' • ')
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
    // PHONE-FIRST FLOW
    // =============================================================================

    let resendCooldownTimer = null;
    let submittedName = '';
    let submittedPhone = '';

    /**
     * Format phone number as user types - US format (XXX) XXX-XXXX
     */
    function formatPhoneNumber(value) {
        // Remove all non-digits, limit to 10
        const digits = value.replace(/\D/g, '').slice(0, 10);

        // Format progressively as user types
        if (digits.length === 0) return '';
        if (digits.length < 4) return `(${digits}`;
        if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    /**
     * Get cursor position in terms of digit count
     */
    function getDigitPosition(value, cursorPos) {
        return value.slice(0, cursorPos).replace(/\D/g, '').length;
    }

    /**
     * Get cursor position from digit position in formatted string
     */
    function getCursorFromDigitPos(formatted, digitPos) {
        let digits = 0;
        for (let i = 0; i < formatted.length; i++) {
            if (/\d/.test(formatted[i])) {
                digits++;
                if (digits === digitPos) return i + 1;
            }
        }
        return formatted.length;
    }

    /**
     * Validate phone number (US format)
     */
    function isValidPhone(value) {
        const digits = value.replace(/\D/g, '');
        return digits.length === 10;
    }

    /**
     * Validate full name (must have first and last name)
     * - At least 2 words separated by space
     * - Each word at least 2 characters
     * - Only letters, hyphens, and apostrophes allowed
     */
    function isValidFullName(value) {
        if (!value || typeof value !== 'string') return false;

        const trimmed = value.trim();
        // Split on whitespace and filter empty parts
        const parts = trimmed.split(/\s+/).filter(p => p.length > 0);

        // Must have at least 2 parts (first and last name)
        if (parts.length < 2) return false;

        // Each part must be at least 2 characters and contain only valid characters
        const validNamePart = /^[a-zA-Z][a-zA-Z'-]*[a-zA-Z]$|^[a-zA-Z]{2}$/;
        return parts.every(part => part.length >= 2 && validNamePart.test(part));
    }

    /**
     * Normalize phone to E.164 format for API
     */
    function normalizePhone(value) {
        const digits = value.replace(/\D/g, '');
        return `+1${digits}`;
    }

    /**
     * Initialize phone-first flow UI
     */
    function initPhoneFirstFlow() {
        const nameInput = document.getElementById('name-input');
        const phoneInput = document.getElementById('phone-input');
        const sendBtn = document.getElementById('send-link-btn');
        const errorEl = document.getElementById('phone-error');

        if (!phoneInput || !sendBtn) return;

        // Clear error when typing in name
        nameInput?.addEventListener('input', () => {
            errorEl.style.display = 'none';
        });

        // Format phone as user types
        phoneInput.addEventListener('input', (e) => {
            const input = e.target;
            const oldValue = input.value;
            const cursorPos = input.selectionStart;

            // Track digit position before formatting
            const digitPos = getDigitPosition(oldValue, cursorPos);

            // Format the number
            const formatted = formatPhoneNumber(oldValue);
            input.value = formatted;

            // Restore cursor position based on digit position
            const newCursorPos = getCursorFromDigitPos(formatted, digitPos);
            input.setSelectionRange(newCursorPos, newCursorPos);

            // Clear error when typing
            errorEl.style.display = 'none';
        });

        // Handle keydown to prevent non-digit input
        phoneInput.addEventListener('keydown', (e) => {
            // Allow: backspace, delete, tab, escape, enter, arrows
            if ([8, 9, 27, 13, 46, 37, 38, 39, 40].includes(e.keyCode)) return;
            // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
            if ((e.ctrlKey || e.metaKey) && [65, 67, 86, 88].includes(e.keyCode)) return;
            // Block non-digit keys
            if (!/^\d$/.test(e.key)) {
                e.preventDefault();
            }
        });

        // Handle send button click
        sendBtn.addEventListener('click', async () => {
            const name = nameInput?.value?.trim() || '';
            const phone = phoneInput.value;

            // Collect all validation errors
            const errors = [];

            if (!name) {
                errors.push('Please enter your name');
            } else if (!isValidFullName(name)) {
                errors.push('Please enter your first and last name');
            }

            if (!isValidPhone(phone)) {
                errors.push('Please enter a valid 10-digit phone number');
            }

            if (errors.length > 0) {
                errorEl.innerHTML = errors.join('<br>');
                errorEl.style.display = 'block';
                if (!name || !isValidFullName(name)) {
                    nameInput?.focus();
                } else {
                    phoneInput.focus();
                }
                return;
            }

            await submitPhone(name, phone, sendBtn, errorEl);
        });

        // Handle enter key
        phoneInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendBtn.click();
            }
        });

        // Initialize resend button
        const resendBtn = document.getElementById('resend-link-btn');
        resendBtn?.addEventListener('click', async () => {
            if (submittedPhone && submittedName) {
                await submitPhone(submittedName, submittedPhone, resendBtn, errorEl, true);
            }
        });

        // Initialize "different phone" button
        const differentPhoneBtn = document.getElementById('different-phone-btn');
        differentPhoneBtn?.addEventListener('click', () => {
            showStep('phone');
            phoneInput.value = '';
            phoneInput.focus();
        });
    }

    /**
     * Submit name and phone to Levee API
     */
    async function submitPhone(name, phone, btn, errorEl, isResend = false) {
        const btnText = btn.querySelector('.btn-text');
        const btnLoading = btn.querySelector('.btn-loading');

        // Show loading state
        btn.disabled = true;
        if (btnText) btnText.style.display = 'none';
        if (btnLoading) btnLoading.style.display = 'flex';

        try {
            // Get reCAPTCHA token (bypass errors for testing)
            let recaptchaToken = '';
            if (typeof grecaptcha !== 'undefined') {
                try {
                    recaptchaToken = await grecaptcha.execute(
                        LEVEE_CONFIG.recaptchaSiteKey,
                        { action: 'schedule' }
                    );
                } catch {
                    // Continue without token - backend will accept if configured to bypass
                }
            }

            // Submit to Levee API
            const response = await fetch(`${LEVEE_CONFIG.apiUrl}/api/public/schedule`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name.trim(),
                    phone: normalizePhone(phone),
                    siteKey: LEVEE_CONFIG.siteKey,
                    recaptchaToken,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send booking link');
            }

            // In dev mode, log the booking URL to console for easy testing
            if (data.devBookingUrl) {
                console.log('%c📱 BOOKING URL (dev mode):', 'color: #e91e8c; font-weight: bold; font-size: 14px;');
                console.log('%c' + data.devBookingUrl, 'color: #0066cc; font-size: 12px;');
            }

            // Success! Show confirmation step
            submittedName = name;
            submittedPhone = phone;
            showConfirmationStep(phone);

            // Start resend cooldown
            if (isResend) {
                startResendCooldown();
            }

        } catch (error) {
            errorEl.textContent = error.message || 'Something went wrong. Please try again.';
            errorEl.style.display = 'block';
        } finally {
            // Reset button state
            btn.disabled = false;
            if (btnText) btnText.style.display = 'inline';
            if (btnLoading) btnLoading.style.display = 'none';
        }
    }

    /**
     * Show the confirmation step after phone submission
     */
    function showConfirmationStep(phone) {
        // Update the phone display
        const phoneDisplay = document.getElementById('confirmation-phone');
        if (phoneDisplay) {
            phoneDisplay.textContent = phone;
        }

        // Show confirmation step
        showStep('confirmation');

        // Start resend cooldown
        startResendCooldown();
    }

    /**
     * Show a specific step by ID or index
     */
    function showStep(stepId) {
        const steps = document.querySelectorAll('.estimator-step');
        steps.forEach(step => {
            const isTarget = step.id === `step-${stepId}` ||
                step.dataset.stepIndex === stepId ||
                step.dataset.stepIndex === String(stepId);
            step.classList.toggle('active', isTarget);
        });
    }

    /**
     * Start the resend cooldown timer
     */
    function startResendCooldown() {
        const resendBtn = document.getElementById('resend-link-btn');
        const cooldownEl = document.getElementById('resend-cooldown');
        const timerEl = document.getElementById('cooldown-timer');

        if (!resendBtn || !cooldownEl || !timerEl) return;

        // Clear any existing timer
        if (resendCooldownTimer) {
            clearInterval(resendCooldownTimer);
        }

        // Hide resend button, show cooldown
        resendBtn.style.display = 'none';
        cooldownEl.style.display = 'inline';

        let seconds = 60;
        timerEl.textContent = seconds;

        resendCooldownTimer = setInterval(() => {
            seconds--;
            timerEl.textContent = seconds;

            if (seconds <= 0) {
                clearInterval(resendCooldownTimer);
                resendCooldownTimer = null;

                // Show resend button, hide cooldown
                resendBtn.style.display = 'inline';
                cooldownEl.style.display = 'none';
            }
        }, 1000);
    }

    // =============================================================================
    // WIZARD NAVIGATION
    // =============================================================================

    function initWizard() {
        const steps = document.querySelectorAll('.estimator-step');
        if (!steps.length) return;

        document.getElementById('household-continue-btn')?.addEventListener('click', () => {
            if (state.household.pets.length > 0) goToStep(1);
        });

        document.getElementById('btn-new-customer')?.addEventListener('click', () => {
            state.household.isNewClient = true;
            showClientTypeContent();
            goToStep(2);
        });

        document.getElementById('btn-existing-customer')?.addEventListener('click', () => {
            state.household.isNewClient = false;
            showClientTypeContent();
            goToStep(2);
        });

        initSchedulingButton();

        if (loadState() && state.household.pets.length > 0) {
            renderPetCards();
            updateHouseholdStepUI();
            goToStep(state.currentStep);
        } else {
            goToStep(0);
        }
    }

    function canProceedFromStep(step) {
        return step !== 0 || state.household.pets.length > 0;
    }

    function goToStep(stepIndex) {
        if (state.currentStep === 2 && stepIndex !== 2) {
            savePetSelections();
        }

        state.currentStep = stepIndex;

        document.querySelectorAll('.estimator-step').forEach((step, i) => {
            step.classList.toggle('active', i === stepIndex);
        });

        if (stepIndex === 1) {
            updateNewClientPricing();
        } else if (stepIndex === 2) {
            showClientTypeContent();
            if (!state.household.isNewClient && state.household.pets.length > 0) {
                selectPet(state.currentPetId || state.household.pets[0].id);
            }
        }

        saveState(); // Save immediately for step changes
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
            services: { selectedIds: [], adviceTopics: [], adviceContext: '', customConcerns: [] }
        };

        state.household.pets.push(pet);
        renderPetCards();
        selectPet(pet.id);
        saveState(); // Save immediately for critical changes
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
            const section = document.getElementById('pet-services-section');
            if (section) section.style.display = 'none';
            updateEstimateDisplay();
        }

        saveState(); // Save immediately for critical changes
        updateHouseholdStepUI();
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
        saveState(); // Save immediately when switching pets
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
        // Household step tabs
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
                    if (!e.target.closest('.remove-pet')) selectPet(pet.id);
                });

                if (addBtn) {
                    householdContainer.insertBefore(tab, addBtn);
                } else {
                    householdContainer.appendChild(tab);
                }
            });
        }

        // Services step inline tabs
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
                <span class="service-chiclet chiclet-free" title="A quick examination is included free with vaccinations to ensure your pet is healthy enough to receive them safely.">
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
            resultEmpty.style.display = 'block';
            resultContent.style.display = 'none';
            return;
        }

        resultEmpty.style.display = 'none';
        resultContent.style.display = 'block';

        const isInPerson = requiresInPersonVisit();
        document.getElementById('visit-type-value').textContent = isInPerson ? 'In-Person Visit' : 'Virtual Visit';
        document.getElementById('visit-type-location').textContent = isInPerson ? 'Greater Cleveland Area' : 'Anywhere in Ohio';

        const timeEstimate = estimateAppointmentTime();
        document.getElementById('duration-display').textContent = timeEstimate.formatted;
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
        { label: 'Skin scraping', type: 'in-person', time: 15 },
        { label: 'Abscess drainage', type: 'in-person', time: 25 },
        { label: 'Suture removal', type: 'in-person', time: 15 },
        { label: 'Bandage change', type: 'in-person', time: 15 },
        { label: 'Fecal sample collection', type: 'in-person', time: 10 },
        { label: 'Deworming treatment', type: 'in-person', time: 10 },
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
    // SCHEDULING BUTTON & REDIRECT
    // =============================================================================

    function initSchedulingButton() {
        const btn = document.getElementById('continue-to-scheduling-btn');
        btn?.addEventListener('click', async () => {
            savePetSelections();
            await redirectToLeveeBooking(btn, false);
        });

        const newClientBtn = document.getElementById('book-first-visit-btn');
        newClientBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            await redirectToLeveeBooking(newClientBtn, true);
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

    async function redirectToLeveeBooking(btn, isNewClientParam = null) {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner"></span> Redirecting...';

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

            const returnUrl = `${window.location.origin}${window.location.pathname}?booking=success`;

            const appointmentData = {
                siteKey: LEVEE_CONFIG.siteKey,
                household: state.household.pets.map(pet => ({
                    name: pet.name,
                    species: pet.type,
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
                returnUrl,
            };

            const encodedData = encodeURIComponent(JSON.stringify(appointmentData));
            window.location.href = `${LEVEE_CONFIG.apiUrl}/book-external.html?data=${encodedData}`;

        } catch {
            btn.disabled = false;
            btn.textContent = originalText;
            alert('Unable to proceed to scheduling. Please try again.');
        }
    }

    // =============================================================================
    // BOOKING SUCCESS
    // =============================================================================

    function showBookingSuccess() {
        const petNames = state.household.pets.map(p => p.name).join(' & ') || 'your pet';

        const scheduleSection = document.getElementById('schedule');
        if (!scheduleSection) return;

        const container = isStandalone ? scheduleSection : scheduleSection.querySelector('.container') || scheduleSection;

        container.innerHTML = `
            <div class="booking-success-screen">
                <div class="success-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 12l2.5 2.5L16 9"/>
                    </svg>
                </div>
                <h2>You're All Set!</h2>
                <p class="success-message">
                    Your appointment for <strong>${escapeHtml(petNames)}</strong> has been scheduled.
                </p>
                <p class="success-details">
                    You'll receive a confirmation email shortly with all the details.
                </p>
                <div class="success-actions">
                    <button class="btn-primary" onclick="Scheduler.dismissSuccess()">
                        ${isStandalone ? 'Schedule Another' : 'Done'}
                    </button>
                    <a href="/" class="btn-secondary">
                        Return to Home
                    </a>
                </div>
            </div>
        `;
    }

    function dismissSuccess() {
        clearState();
        if (isStandalone) {
            window.location.href = window.location.pathname;
        } else {
            window.location.href = window.location.pathname + '#services';
            window.location.reload();
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // =============================================================================
    // PUBLIC API
    // =============================================================================

    return {
        /**
         * Initialize the scheduler
         * @param {Object} options
         * @param {boolean} options.standalone - true for standalone page
         */
        init(options = {}) {
            isStandalone = options.standalone || false;

            // Check for booking success redirect
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('booking') === 'success') {
                loadState();
                showBookingSuccess();
                history.replaceState({}, '', window.location.pathname + (isStandalone ? '' : '#services'));
                return;
            }

            initPhoneFirstFlow();

            // Initialize standard flow
            initPetManagement();
            initWizard();

            if (state.household.pets.length > 0) {
                renderPetCards();
            }
        },

        // Expose for debugging and success dismiss
        getState: () => state,
        clearState,
        dismissSuccess,
    };
})();

// Expose globally
window.Scheduler = Scheduler;
