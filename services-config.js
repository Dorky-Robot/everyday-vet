// Service Configuration
// Edit this file to update pricing, services, and categories
const SERVICES_CONFIG = {
  pricing: {
    baseRate: 75,
    additionalRate: 50,
    timeIncrement: 30,
    travelFee: 100
  },
  categories: [
    {
      id: "advice",
      title: "Advice & Guidance",
      visitType: "both",
      defaultType: "virtual",
      timeMode: "smart",
      requiresConsultation: true,
      items: [
        { id: "new-pet", label: "New pet consultation", time: 15 },
        { id: "diet", label: "Diet & nutrition", time: 10 },
        { id: "behavior", label: "Behavioral concerns", time: 20 },
        { id: "preventatives", label: "Preventatives (flea, tick, heartworm)", time: 10 },
        { id: "skin-issues", label: "Skin issues or allergies", time: 10 },
        { id: "gi-issues", label: "Digestive issues", time: 10 },
        { id: "chronic", label: "Chronic disease management", time: 15 },
        { id: "senior", label: "Senior pet care", time: 15 },
        { id: "second-opinion", label: "Second opinion", time: 20 },
        { id: "quality-of-life", label: "Quality of life consultation", time: 20 }
      ]
    },
    {
      id: "exam",
      title: "Physical Examination",
      visitType: "in-person",
      defaultType: "in-person",
      timeMode: "additive",
      requiresConsultation: true,
      items: [
        { id: "exam", label: "Comprehensive physical exam", time: 15 }
      ]
    },
    {
      id: "vaccines",
      title: "Vaccinations",
      visitType: "in-person",
      pricingNote: "per vaccine",
      defaultType: "in-person",
      timeMode: "additive",
      note: "Select all vaccines needed. Each adds minimal time.",
      items: [
        { id: "vaccine-rabies", label: "Rabies", time: 3, cost: 30, petType: "dog" },
        { id: "vaccine-dhpp", label: "DHPP / DAPP / DHLPP", time: 3, cost: 35, petType: "dog" },
        { id: "vaccine-bordetella", label: "Bordetella (kennel cough)", time: 3, cost: 30, petType: "dog" },
        { id: "vaccine-lepto", label: "Leptospirosis", time: 3, cost: 30, petType: "dog" },
        { id: "vaccine-lyme", label: "Lyme", time: 3, cost: 45, petType: "dog" },
        { id: "vaccine-flu", label: "Flu", time: 3, cost: 40, petType: "dog" },
        { id: "vaccine-fvrcp", label: "FVRCP", time: 3, cost: 30, petType: "cat" },
        { id: "vaccine-felv", label: "FeLV", time: 3, cost: 40, petType: "cat" },
        { id: "vaccine-rabies1", label: "Rabies 1 year", time: 3, cost: 30, petType: "cat" },
        { id: "vaccine-rabies3", label: "Rabies 3 year", time: 3, cost: 75, petType: "cat" },
      ]
    },
    {
      id: "labs",
      title: "Lab Work",
      visitType: "in-person",
      pricingNote: "per test",
      defaultType: "in-person",
      timeMode: "additive",
      note: "Sample collection included. Results reviewed via text or at follow-up.",
      items: [
        { id: "lab-heartworm", label: "Heartworm test", time: 3, cost: 55, petType: "dog" },
        { id: "lab-felv-fiv", label: "FeLV/FIV test", time: 3, cost: 55, petType: "cat" }
      ]
    },
    {
      id: "procedures",
      title: "Procedures",
      visitType: "in-person",
      pricingNote: "per service",
      defaultType: "in-person",
      timeMode: "additive",
      items: [
        { id: "proc-nail-trim", label: "Nail trim", time: 10, cost: 30 },
        { id: "proc-anal-glands", label: "Anal gland expression", time: 10, cost: 35, petType: "dog" },
        { id: "proc-ear-clean", label: "Ear cleaning", time: 15, cost: 30, petType: "dog" },
        { id: "proc-wound-care", label: "Minor wound care", time: 20, cost: 50 }
      ]
    },
    {
      id: "special",
      title: "Special Services",
      visitType: "in-person",
      defaultType: "in-person",
      timeMode: "additive",
      items: [
        { id: "health-cert", label: "Health certificate - interstate only", time: 25, cost: 75 },
        { id: "euthanasia", label: "End-of-life care / euthanasia", time: 45, note: "Contact for pricing" }
      ]
    },
    {
      id: "other",
      title: "Something Else?",
      visitType: "search",
      defaultType: "virtual",
      timeMode: "additive",
      requiresConsultation: true,
      isCustomInput: true
    }
  ]
};
