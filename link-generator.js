/**
 * Everyday Vet - Shareable Link Generator
 *
 * Utility for external parties to generate pre-filled scheduling URLs.
 *
 * Usage (browser):
 *   <script src="https://everyday.vet/link-generator.js"></script>
 *   const url = EverydayVetLinks.generate({ pet: 'Luna', type: 'cat', isNewClient: false });
 *
 * Usage (Node.js):
 *   const { generate, encode, decode } = require('./link-generator.js');
 *   const url = generate({ pet: 'Luna', type: 'cat', isNewClient: false });
 */

(function(root) {
    'use strict';

    const BASE_URL = 'https://everyday.vet/schedule.html';

    /**
     * Encode state object to URL-safe string
     */
    function encode(stateObj) {
        const json = JSON.stringify(stateObj);
        // Handle both browser and Node.js environments
        if (typeof btoa === 'function') {
            return btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
                String.fromCharCode('0x' + p1)
            ));
        } else {
            // Node.js
            return Buffer.from(json, 'utf-8').toString('base64');
        }
    }

    /**
     * Decode URL string back to state object
     */
    function decode(encoded) {
        if (typeof atob === 'function') {
            const json = decodeURIComponent(
                atob(encoded).split('').map(c =>
                    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                ).join('')
            );
            return JSON.parse(json);
        } else {
            // Node.js
            return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
        }
    }

    /**
     * Build full state object from simple options
     */
    function buildState(options) {
        const pets = [];
        const now = Date.now();

        // Handle single pet
        if (options.pet && options.type) {
            pets.push({
                id: now,
                name: options.pet,
                type: options.type,
                services: {
                    selectedIds: options.services || [],
                    adviceTopics: options.adviceTopics || [],
                    adviceContext: options.adviceContext || '',
                    customConcerns: []
                }
            });
        }

        // Handle multiple pets: [{ name: 'Luna', type: 'cat' }, { name: 'Max', type: 'dog' }]
        if (options.pets && Array.isArray(options.pets)) {
            options.pets.forEach((pet, index) => {
                pets.push({
                    id: now + index,
                    name: pet.name,
                    type: pet.type,
                    services: {
                        selectedIds: pet.services || [],
                        adviceTopics: pet.adviceTopics || [],
                        adviceContext: pet.adviceContext || '',
                        customConcerns: []
                    }
                });
            });
        }

        // Determine step based on what's provided
        let step = 0;
        if (pets.length > 0) {
            step = options.isNewClient !== undefined ? 2 : 1;
        }

        return {
            step: step,
            isNewClient: options.isNewClient !== undefined ? options.isNewClient : null,
            pets: pets,
            currentPetId: pets.length > 0 ? pets[0].id : null,
            client: {
                name: options.clientName || '',
                email: options.clientEmail || '',
                phone: options.clientPhone || ''
            }
        };
    }

    /**
     * Generate a shareable scheduling URL
     *
     * @param {Object} options
     * @param {string} options.pet - Single pet name
     * @param {string} options.type - Pet type ('dog' or 'cat')
     * @param {Array} options.pets - Multiple pets: [{ name, type, services? }]
     * @param {boolean} options.isNewClient - true for new, false for existing, omit for selection step
     * @param {Array} options.services - Pre-selected service IDs for single pet
     * @param {Array} options.adviceTopics - Pre-selected advice topics
     * @param {string} options.clientName - Client's name
     * @param {string} options.clientEmail - Client's email
     * @param {string} options.clientPhone - Client's phone
     * @param {string} options.baseUrl - Override base URL (for testing)
     * @returns {string} Full URL with encoded state
     *
     * @example
     * // Simple: existing client with one pet
     * generate({ pet: 'Luna', type: 'cat', isNewClient: false })
     *
     * @example
     * // With services pre-selected
     * generate({
     *   pet: 'Max',
     *   type: 'dog',
     *   isNewClient: false,
     *   services: ['vaccine-rabies', 'vaccine-dhpp']
     * })
     *
     * @example
     * // Multiple pets
     * generate({
     *   pets: [
     *     { name: 'Luna', type: 'cat' },
     *     { name: 'Max', type: 'dog', services: ['vaccine-rabies'] }
     *   ],
     *   isNewClient: false
     * })
     */
    function generate(options = {}) {
        const state = buildState(options);
        const encoded = encode(state);
        const baseUrl = options.baseUrl || BASE_URL;
        return `${baseUrl}?s=${encoded}`;
    }

    /**
     * Available service IDs
     */
    const SERVICE_IDS = {
        // Vaccines
        vaccines: [
            'vaccine-rabies',
            'vaccine-rabies-3yr',
            'vaccine-dhpp',
            'vaccine-bordetella',
            'vaccine-lepto',
            'vaccine-lyme',
            'vaccine-flu',
            'vaccine-fvrcp',
            'vaccine-felv'
        ],
        // Lab Work
        labs: [
            'lab-heartworm',
            'lab-fecal',
            'lab-blood-panel',
            'lab-urinalysis',
            'lab-thyroid',
            'lab-4dx'
        ],
        // Procedures
        procedures: [
            'proc-nail-trim',
            'proc-anal-glands',
            'proc-ear-clean',
            'proc-wound-care'
        ],
        // Special Services
        special: [
            'special-health-cert',
            'special-euthanasia'
        ]
    };

    // Export for different environments
    const exports = {
        generate,
        encode,
        decode,
        buildState,
        SERVICE_IDS,
        BASE_URL
    };

    // Browser global
    if (typeof window !== 'undefined') {
        window.EverydayVetLinks = exports;
    }

    // Node.js / CommonJS
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exports;
    }

    // AMD
    if (typeof define === 'function' && define.amd) {
        define(function() { return exports; });
    }

})(this);
