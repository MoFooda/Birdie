/**
 * Demo dataset.
 *
 * Thirteen companies chosen to exercise the whole decision surface: very high through
 * skip-level opportunities, sites that read cleanly, sites that fail in five different
 * ways, a cross-host redirect, a parked domain, a domain for sale, an Arabic-language
 * site, and a company with no website at all.
 *
 * Everything here is fictional and is labelled as demo data in the UI.
 */

import type { SiteSpec } from './site-builder';

export interface DemoContact {
  first_name: string;
  last_name: string;
  job_title: string;
  email: string;
  phone: string;
  linkedin_url: string;
  apollo_contact_id: string;
  whatsapp_consent: boolean;
}

export interface DemoCompany {
  name: string;
  website: string;
  sector: string;
  description: string;
  employee_count: number;
  country: string;
  city: string;
  linkedin_url: string;
  apollo_company_id: string;
  contact: DemoContact;
  /** Sub-sector key used to look up competitors in the fixture search provider. */
  competitor_pool: string;
}

export const DEMO_COMPANIES: DemoCompany[] = [
  {
    name: 'Al Noor Dental Clinic',
    website: 'alnoordental.ae',
    sector: 'Hospital & Health Care',
    description: 'Family and cosmetic dentistry clinic serving Dubai residents since 2011.',
    employee_count: 24,
    country: 'United Arab Emirates',
    city: 'Dubai',
    linkedin_url: 'https://www.linkedin.com/company/al-noor-dental',
    apollo_company_id: 'apollo_co_1001',
    competitor_pool: 'dental_clinic_ae',
    contact: {
      first_name: 'Hana',
      last_name: 'Al Rashid',
      job_title: 'Practice Manager',
      email: 'hana@alnoordental.ae',
      phone: '+971 4 555 0111',
      linkedin_url: 'https://www.linkedin.com/in/hana-alrashid',
      apollo_contact_id: 'apollo_ct_2001',
      whatsapp_consent: true,
    },
  },
  {
    name: 'Marina Aesthetics Clinic',
    website: 'https://www.marinaaesthetics.ae/',
    sector: 'Hospital & Health Care',
    description: 'Aesthetic and dermatology clinic in Dubai Marina with online booking.',
    employee_count: 31,
    country: 'United Arab Emirates',
    city: 'Dubai',
    linkedin_url: 'https://www.linkedin.com/company/marina-aesthetics',
    apollo_company_id: 'apollo_co_1002',
    competitor_pool: 'dental_clinic_ae',
    contact: {
      first_name: 'Karim',
      last_name: 'Haddad',
      job_title: 'Operations Director',
      email: 'karim@marinaaesthetics.ae',
      phone: '+971 4 555 0122',
      linkedin_url: 'https://www.linkedin.com/in/karim-haddad',
      apollo_contact_id: 'apollo_ct_2002',
      whatsapp_consent: false,
    },
  },
  {
    name: 'Noor Family Medical Centre',
    website: 'noorfamilymedical.ae',
    sector: 'Hospital & Health Care',
    description: 'Family medicine and paediatrics clinic taking appointments by phone only.',
    employee_count: 18,
    country: 'United Arab Emirates',
    city: 'Sharjah',
    linkedin_url: 'https://www.linkedin.com/company/noor-family-medical',
    apollo_company_id: 'apollo_co_1013',
    competitor_pool: 'dental_clinic_ae',
    contact: {
      first_name: 'Amal',
      last_name: 'Zayed',
      job_title: 'Clinic Manager',
      email: 'amal@noorfamilymedical.ae',
      phone: '+971 6 555 0233',
      linkedin_url: 'https://www.linkedin.com/in/amal-zayed',
      apollo_contact_id: 'apollo_ct_2013',
      whatsapp_consent: true,
    },
  },
  {
    name: 'Zayn Home Living',
    website: 'zaynhomeliving.com',
    sector: 'Retail',
    description: 'Home furniture and décor brand selling across the GCC.',
    employee_count: 48,
    country: 'United Arab Emirates',
    city: 'Sharjah',
    linkedin_url: 'https://www.linkedin.com/company/zayn-home-living',
    apollo_company_id: 'apollo_co_1003',
    competitor_pool: 'home_ecommerce_gcc',
    contact: {
      first_name: 'Dana',
      last_name: 'Mansour',
      job_title: 'Marketing Manager',
      email: 'dana@zaynhomeliving.com',
      phone: '+971 6 555 0133',
      linkedin_url: 'https://www.linkedin.com/in/dana-mansour',
      apollo_contact_id: 'apollo_ct_2003',
      whatsapp_consent: true,
    },
  },
  {
    name: 'Layla Skincare',
    website: 'https://laylaskincare.com',
    sector: 'Consumer Goods',
    description: 'Direct-to-consumer skincare brand with an established online store.',
    employee_count: 19,
    country: 'United Arab Emirates',
    city: 'Dubai',
    linkedin_url: 'https://www.linkedin.com/company/layla-skincare',
    apollo_company_id: 'apollo_co_1004',
    competitor_pool: 'home_ecommerce_gcc',
    contact: {
      first_name: 'Nour',
      last_name: 'Fahmy',
      job_title: 'Head of Growth',
      email: 'nour@laylaskincare.com',
      phone: '+971 4 555 0144',
      linkedin_url: 'https://www.linkedin.com/in/nour-fahmy',
      apollo_contact_id: 'apollo_ct_2004',
      whatsapp_consent: false,
    },
  },
  {
    name: 'Gulf Legal Partners',
    website: 'www.gulflegalpartners.com',
    sector: 'Law Practice',
    description: 'Corporate and commercial law firm advising regional businesses.',
    employee_count: 62,
    country: 'United Arab Emirates',
    city: 'Abu Dhabi',
    linkedin_url: 'https://www.linkedin.com/company/gulf-legal-partners',
    apollo_company_id: 'apollo_co_1005',
    competitor_pool: 'law_firm_ae',
    contact: {
      first_name: 'Omar',
      last_name: 'Saeed',
      job_title: 'Managing Partner',
      email: 'omar.saeed@gulflegalpartners.com',
      phone: '+971 2 555 0155',
      linkedin_url: 'https://www.linkedin.com/in/omar-saeed',
      apollo_contact_id: 'apollo_ct_2005',
      whatsapp_consent: false,
    },
  },
  {
    name: 'Meridian Consulting Group',
    website: '',
    sector: 'Management Consulting',
    description: 'Boutique operations consultancy working with regional manufacturers.',
    employee_count: 14,
    country: 'United Arab Emirates',
    city: 'Dubai',
    linkedin_url: 'https://www.linkedin.com/company/meridian-consulting-group',
    apollo_company_id: 'apollo_co_1006',
    competitor_pool: 'law_firm_ae',
    contact: {
      first_name: 'Sara',
      last_name: 'Khalil',
      job_title: 'Founding Partner',
      email: 'sara@meridiancg.ae',
      phone: '+971 4 555 0166',
      linkedin_url: 'https://www.linkedin.com/in/sara-khalil',
      apollo_contact_id: 'apollo_ct_2006',
      whatsapp_consent: true,
    },
  },
  {
    name: 'Horizon Stone Works',
    website: 'horizonstoneworks.com',
    sector: 'Building Materials',
    description: 'Marble and natural stone fabrication for contractors and developers.',
    employee_count: 120,
    country: 'Egypt',
    city: 'Cairo',
    linkedin_url: 'https://www.linkedin.com/company/horizon-stone-works',
    apollo_company_id: 'apollo_co_1007',
    competitor_pool: 'stone_manufacturer_mena',
    contact: {
      first_name: 'Tarek',
      last_name: 'Fouad',
      job_title: 'Commercial Director',
      email: 'tarek@horizonstoneworks.com',
      phone: '+20 2 5550 177',
      linkedin_url: 'https://www.linkedin.com/in/tarek-fouad',
      apollo_contact_id: 'apollo_ct_2007',
      whatsapp_consent: true,
    },
  },
  {
    name: 'Cedar Grill House',
    website: 'cedargrillhouse.com',
    sector: 'Restaurants',
    description: 'Lebanese charcoal grill restaurant with three branches.',
    employee_count: 55,
    country: 'United Arab Emirates',
    city: 'Dubai',
    linkedin_url: 'https://www.linkedin.com/company/cedar-grill-house',
    apollo_company_id: 'apollo_co_1008',
    competitor_pool: 'restaurant_ae',
    contact: {
      first_name: 'Rami',
      last_name: 'Aoun',
      job_title: 'Owner',
      email: 'rami@cedargrillhouse.com',
      phone: '+971 4 555 0188',
      linkedin_url: 'https://www.linkedin.com/in/rami-aoun',
      apollo_contact_id: 'apollo_ct_2008',
      whatsapp_consent: true,
    },
  },
  {
    name: 'Falcon Logistics Systems',
    website: 'falconlogistics.io',
    sector: 'Computer Software',
    description: 'Fleet and last-mile delivery management software for regional operators.',
    employee_count: 37,
    country: 'Saudi Arabia',
    city: 'Riyadh',
    linkedin_url: 'https://www.linkedin.com/company/falcon-logistics-systems',
    apollo_company_id: 'apollo_co_1009',
    competitor_pool: 'logistics_saas',
    contact: {
      first_name: 'Faisal',
      last_name: 'Otaibi',
      job_title: 'VP Marketing',
      email: 'faisal@falconlogistics.io',
      phone: '+966 11 555 0199',
      linkedin_url: 'https://www.linkedin.com/in/faisal-otaibi',
      apollo_contact_id: 'apollo_ct_2009',
      whatsapp_consent: false,
    },
  },
  {
    name: 'Desert Rose Interiors',
    website: 'desertroseinteriors.ae',
    sector: 'Design',
    description: 'Interior fit-out contractor for residential and hospitality projects.',
    employee_count: 44,
    country: 'United Arab Emirates',
    city: 'Dubai',
    linkedin_url: 'https://www.linkedin.com/company/desert-rose-interiors',
    apollo_company_id: 'apollo_co_1010',
    competitor_pool: 'stone_manufacturer_mena',
    contact: {
      first_name: 'Maya',
      last_name: 'Idris',
      job_title: 'Business Development Lead',
      email: 'maya@desertroseinteriors.ae',
      phone: '+971 4 555 0200',
      linkedin_url: 'https://www.linkedin.com/in/maya-idris',
      apollo_contact_id: 'apollo_ct_2010',
      whatsapp_consent: false,
    },
  },
  {
    name: 'Bright Path Academy',
    website: 'brightpathacademy.ae',
    sector: '',
    description: 'After-school tutoring and enrichment centre for school-age students.',
    employee_count: 28,
    country: 'United Arab Emirates',
    city: 'Dubai',
    linkedin_url: 'https://www.linkedin.com/company/bright-path-academy',
    apollo_company_id: 'apollo_co_1011',
    competitor_pool: 'dental_clinic_ae',
    contact: {
      first_name: 'Leen',
      last_name: 'Barakat',
      job_title: 'Centre Director',
      email: 'leen@brightpathacademy.ae',
      phone: '+971 4 555 0211',
      linkedin_url: 'https://www.linkedin.com/in/leen-barakat',
      apollo_contact_id: 'apollo_ct_2011',
      whatsapp_consent: true,
    },
  },
  {
    name: 'معرض سوق الفن',
    website: 'souqalfann.com',
    sector: 'Retail',
    description: 'معرض للأثاث والتحف الشرقية في القاهرة، يبيع للأفراد والفنادق.',
    employee_count: 22,
    country: 'Egypt',
    city: 'Cairo',
    linkedin_url: 'https://www.linkedin.com/company/souq-al-fann',
    apollo_company_id: 'apollo_co_1012',
    competitor_pool: 'home_ecommerce_gcc',
    contact: {
      first_name: 'Youssef',
      last_name: 'Kamal',
      job_title: 'مدير المبيعات',
      email: 'youssef@souqalfann.com',
      phone: '+20 2 5550 222',
      linkedin_url: 'https://www.linkedin.com/in/youssef-kamal',
      apollo_contact_id: 'apollo_ct_2012',
      whatsapp_consent: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Fixture websites, keyed by normalised domain
// ---------------------------------------------------------------------------

export const SITE_SPECS: Record<string, SiteSpec> = {
  // Weak clinic site: no booking, no mobile viewport, no tracking → very high need.
  'alnoordental.ae': {
    domain: 'alnoordental.ae',
    name: 'Al Noor Dental Clinic',
    kind: 'live',
    tagline: 'Family and cosmetic dentistry in Dubai',
    features: ['contact_details', 'responsive'],
    pages: ['about', 'services'],
    broken_pages: ['contact'],
    pagespeed_mobile: 31,
    pagespeed_desktop: 62,
  },
  // Strong clinic site → low opportunity even in a website-critical sector.
  'marinaaesthetics.ae': {
    domain: 'marinaaesthetics.ae',
    name: 'Marina Aesthetics Clinic',
    kind: 'live',
    tagline: 'Dermatology and aesthetics in Dubai Marina',
    features: [
      'viewport', 'responsive', 'canonical', 'sitemap', 'meta_description',
      'booking_link', 'contact_form', 'whatsapp_link', 'click_to_call',
      'testimonials', 'reviews', 'certifications', 'contact_details',
      'ga4', 'gtm', 'meta_pixel',
    ],
    pages: ['about', 'services', 'contact', 'blog'],
    pagespeed_mobile: 84,
    pagespeed_desktop: 96,
  },
  // Domain for sale in a booking-critical sector → the highest opportunity in the set.
  'noorfamilymedical.ae': {
    domain: 'noorfamilymedical.ae',
    name: 'Noor Family Medical Centre',
    kind: 'for_sale',
    features: [],
  },
  // Furniture catalogue with no checkout → very high need in an e-commerce sector.
  'zaynhomeliving.com': {
    domain: 'zaynhomeliving.com',
    name: 'Zayn Home Living',
    kind: 'live',
    tagline: 'Furniture and home décor',
    features: ['viewport', 'responsive', 'meta_description', 'contact_details', 'click_to_call'],
    pages: ['about', 'products', 'contact'],
    pagespeed_mobile: 44,
    pagespeed_desktop: 71,
  },
  // Mature store → minimal opportunity.
  'laylaskincare.com': {
    domain: 'laylaskincare.com',
    name: 'Layla Skincare',
    kind: 'live',
    tagline: 'Clean skincare, made in the UAE',
    features: [
      'viewport', 'responsive', 'canonical', 'sitemap', 'meta_description',
      'checkout_or_cart', 'pricing', 'contact_form', 'whatsapp_link',
      'reviews', 'testimonials', 'contact_details', 'ga4', 'meta_pixel', 'other_tracking',
    ],
    pages: ['about', 'products', 'contact', 'blog'],
    pagespeed_mobile: 78,
    pagespeed_desktop: 93,
  },
  // Credible but proof-free law firm → mid-to-high, targeted work.
  'gulflegalpartners.com': {
    domain: 'gulflegalpartners.com',
    name: 'Gulf Legal Partners',
    kind: 'live',
    tagline: 'Corporate and commercial counsel',
    features: ['viewport', 'responsive', 'meta_description', 'contact_details', 'click_to_call', 'certifications'],
    pages: ['about', 'services', 'contact'],
    pagespeed_mobile: 58,
    pagespeed_desktop: 88,
  },
  // Parked domain → no working website at all.
  'horizonstoneworks.com': {
    domain: 'horizonstoneworks.com',
    name: 'Horizon Stone Works',
    kind: 'parked',
    features: [],
  },
  // Bot protection → measurement blocked, must not be reported as offline.
  'cedargrillhouse.com': {
    domain: 'cedargrillhouse.com',
    name: 'Cedar Grill House',
    kind: 'bot_protection',
    features: [],
  },
  // Redirects to the marketing host; decent SaaS site missing pricing and proof.
  'falconlogistics.io': {
    domain: 'falconlogistics.io',
    name: 'Falcon Logistics Systems',
    kind: 'redirect',
    redirect_to: 'falconlogisticssystems.com',
    tagline: 'Fleet and last-mile delivery software',
    features: [
      'viewport', 'responsive', 'canonical', 'meta_description',
      'demo_request', 'contact_form', 'client_logos', 'ga4', 'gtm',
    ],
    pages: ['about', 'products', 'contact', 'blog'],
    pagespeed_mobile: 66,
    pagespeed_desktop: 91,
  },
  // DNS failure → domain does not resolve.
  'desertroseinteriors.ae': {
    domain: 'desertroseinteriors.ae',
    name: 'Desert Rose Interiors',
    kind: 'dns_failure',
    features: [],
  },
  // Live but thin, and the sector column was blank → ambiguous, manual review.
  'brightpathacademy.ae': {
    domain: 'brightpathacademy.ae',
    name: 'Bright Path Academy',
    kind: 'live',
    tagline: 'After-school tutoring in Dubai',
    features: ['viewport', 'meta_description', 'contact_details', 'click_to_call', 'whatsapp_link'],
    pages: ['about', 'contact'],
    pagespeed_mobile: 52,
    pagespeed_desktop: 80,
  },
  // Arabic-language storefront missing checkout.
  'souqalfann.com': {
    domain: 'souqalfann.com',
    name: 'معرض سوق الفن',
    kind: 'live',
    lang: 'ar',
    tagline: 'أثاث وتحف شرقية',
    features: ['viewport', 'responsive', 'meta_description', 'whatsapp_link', 'click_to_call', 'contact_details'],
    pages: ['about', 'products', 'contact'],
    pagespeed_mobile: 39,
    pagespeed_desktop: 74,
  },
};

// ---------------------------------------------------------------------------
// Competitor pools — what the fixture search provider "finds"
// ---------------------------------------------------------------------------

export interface DemoCompetitor {
  name: string;
  domain: string;
  geography: string;
  sub_sector: string;
  snippet: string;
}

export const COMPETITOR_POOLS: Record<string, DemoCompetitor[]> = {
  dental_clinic_ae: [
    { name: 'Jumeirah Smile Studio', domain: 'jumeirahsmilestudio.ae', geography: 'Dubai, UAE', sub_sector: 'Appointment-driven clinic', snippet: 'Book a dental appointment online in Dubai Marina.' },
    { name: 'Emirates Dental Centre', domain: 'emiratesdentalcentre.ae', geography: 'Dubai, UAE', sub_sector: 'Appointment-driven clinic', snippet: 'Cosmetic and family dentistry with online booking and WhatsApp.' },
    { name: 'Bayside Dental Care', domain: 'baysidedentalcare.ae', geography: 'Dubai, UAE', sub_sector: 'Appointment-driven clinic', snippet: 'Dental clinic with same-day appointments.' },
    { name: 'Al Waha Polyclinic', domain: 'alwahapolyclinic.ae', geography: 'Dubai, UAE', sub_sector: 'Appointment-driven clinic', snippet: 'Multi-speciality clinic in Al Barsha.' },
    { name: 'Pearl Dental Lounge', domain: 'pearldentallounge.ae', geography: 'Dubai, UAE', sub_sector: 'Appointment-driven clinic', snippet: 'Boutique dental practice.' },
  ],
  home_ecommerce_gcc: [
    { name: 'Casa Nova Living', domain: 'casanovaliving.com', geography: 'UAE', sub_sector: 'E-commerce brand', snippet: 'Shop furniture online with delivery across the GCC.' },
    { name: 'Nest & Nook', domain: 'nestandnook.ae', geography: 'UAE', sub_sector: 'E-commerce brand', snippet: 'Home décor online store.' },
    { name: 'Dar Interiors Shop', domain: 'darinteriorsshop.com', geography: 'Egypt', sub_sector: 'E-commerce brand', snippet: 'Buy furniture online in Cairo.' },
    { name: 'Amber Home Store', domain: 'amberhomestore.com', geography: 'Saudi Arabia', sub_sector: 'E-commerce brand', snippet: 'Online home store with fast checkout.' },
    { name: 'Olive Tree Home', domain: 'olivetreehome.ae', geography: 'UAE', sub_sector: 'E-commerce brand', snippet: 'Furniture and décor.' },
  ],
  law_firm_ae: [
    { name: 'Hamdan & Associates', domain: 'hamdanassociates.ae', geography: 'Abu Dhabi, UAE', sub_sector: 'B2B professional service', snippet: 'Corporate law firm with published case studies.' },
    { name: 'Levant Corporate Counsel', domain: 'levantcounsel.com', geography: 'UAE', sub_sector: 'B2B professional service', snippet: 'Commercial and arbitration practice.' },
    { name: 'Gateway Legal Advisors', domain: 'gatewaylegaladvisors.ae', geography: 'Dubai, UAE', sub_sector: 'B2B professional service', snippet: 'Legal advisory for regional businesses.' },
    { name: 'Sahara Law Chambers', domain: 'saharalawchambers.ae', geography: 'UAE', sub_sector: 'B2B professional service', snippet: 'Litigation and corporate services.' },
  ],
  stone_manufacturer_mena: [
    { name: 'Nile Stone Industries', domain: 'nilestoneindustries.com', geography: 'Egypt', sub_sector: 'Building materials manufacturer', snippet: 'Marble and granite fabrication, request a quote.' },
    { name: 'Atlas Marble Group', domain: 'atlasmarblegroup.com', geography: 'Egypt', sub_sector: 'Building materials manufacturer', snippet: 'Natural stone supplier with project gallery.' },
    { name: 'Delta Granite Co', domain: 'deltagraniteco.com', geography: 'Egypt', sub_sector: 'Building materials manufacturer', snippet: 'Granite and quartz fabrication.' },
  ],
  restaurant_ae: [
    { name: 'Beirut Coals', domain: 'beirutcoals.ae', geography: 'Dubai, UAE', sub_sector: 'Restaurant and local dining', snippet: 'Lebanese grill with online menu and booking.' },
    { name: 'Zaatar House', domain: 'zaatarhouse.ae', geography: 'Dubai, UAE', sub_sector: 'Restaurant and local dining', snippet: 'Levantine dining, call to reserve.' },
    { name: 'Fire & Cedar', domain: 'fireandcedar.ae', geography: 'Dubai, UAE', sub_sector: 'Restaurant and local dining', snippet: 'Charcoal grill restaurant.' },
  ],
  logistics_saas: [
    { name: 'RouteMind', domain: 'routemind.io', geography: 'Global', sub_sector: 'B2B SaaS', snippet: 'Delivery management platform with transparent pricing.' },
    { name: 'FleetCanvas', domain: 'fleetcanvas.com', geography: 'Global', sub_sector: 'B2B SaaS', snippet: 'Fleet operations software, book a demo.' },
    { name: 'Cargo Loop', domain: 'cargoloop.app', geography: 'MENA', sub_sector: 'B2B SaaS', snippet: 'Last-mile delivery SaaS.' },
  ],
};

/** Competitor websites, generated so the competitor analysis measures real markup. */
export const COMPETITOR_SITE_SPECS: Record<string, SiteSpec> = {
  'jumeirahsmilestudio.ae': { domain: 'jumeirahsmilestudio.ae', name: 'Jumeirah Smile Studio', kind: 'live', tagline: 'Dental care in Dubai Marina', features: ['viewport', 'responsive', 'meta_description', 'booking_link', 'contact_form', 'whatsapp_link', 'click_to_call', 'reviews', 'testimonials', 'contact_details', 'ga4'], pages: ['about', 'services', 'contact'] },
  'emiratesdentalcentre.ae': { domain: 'emiratesdentalcentre.ae', name: 'Emirates Dental Centre', kind: 'live', tagline: 'Family dentistry', features: ['viewport', 'responsive', 'meta_description', 'booking_link', 'whatsapp_link', 'click_to_call', 'contact_form', 'reviews', 'certifications', 'contact_details', 'gtm'], pages: ['about', 'services', 'contact'] },
  'baysidedentalcare.ae': { domain: 'baysidedentalcare.ae', name: 'Bayside Dental Care', kind: 'live', tagline: 'Same-day dental appointments', features: ['viewport', 'responsive', 'meta_description', 'booking_link', 'click_to_call', 'contact_form', 'testimonials', 'contact_details', 'ga4', 'meta_pixel'], pages: ['about', 'services', 'contact'] },
  'alwahapolyclinic.ae': { domain: 'alwahapolyclinic.ae', name: 'Al Waha Polyclinic', kind: 'live', tagline: 'Multi-speciality clinic', features: ['viewport', 'meta_description', 'click_to_call', 'contact_details', 'contact_form'], pages: ['about', 'contact'] },
  'pearldentallounge.ae': { domain: 'pearldentallounge.ae', name: 'Pearl Dental Lounge', kind: 'timeout', features: [] },

  'casanovaliving.com': { domain: 'casanovaliving.com', name: 'Casa Nova Living', kind: 'live', tagline: 'Furniture online', features: ['viewport', 'responsive', 'meta_description', 'checkout_or_cart', 'pricing', 'reviews', 'contact_form', 'whatsapp_link', 'contact_details', 'ga4', 'meta_pixel'], pages: ['about', 'products', 'contact'] },
  'nestandnook.ae': { domain: 'nestandnook.ae', name: 'Nest & Nook', kind: 'live', tagline: 'Home décor', features: ['viewport', 'responsive', 'meta_description', 'checkout_or_cart', 'pricing', 'reviews', 'whatsapp_link', 'contact_details', 'ga4'], pages: ['products', 'contact'] },
  'darinteriorsshop.com': { domain: 'darinteriorsshop.com', name: 'Dar Interiors Shop', kind: 'live', tagline: 'Furniture in Cairo', features: ['viewport', 'responsive', 'meta_description', 'checkout_or_cart', 'pricing', 'click_to_call', 'whatsapp_link', 'contact_details', 'meta_pixel'], pages: ['products', 'contact'] },
  'amberhomestore.com': { domain: 'amberhomestore.com', name: 'Amber Home Store', kind: 'live', tagline: 'Online home store', features: ['viewport', 'responsive', 'meta_description', 'checkout_or_cart', 'pricing', 'testimonials', 'reviews', 'contact_form', 'ga4', 'gtm'], pages: ['products', 'about', 'contact'] },
  'olivetreehome.ae': { domain: 'olivetreehome.ae', name: 'Olive Tree Home', kind: 'construction', features: [] },

  'hamdanassociates.ae': { domain: 'hamdanassociates.ae', name: 'Hamdan & Associates', kind: 'live', tagline: 'Corporate law', features: ['viewport', 'responsive', 'meta_description', 'case_studies', 'client_logos', 'contact_form', 'click_to_call', 'certifications', 'contact_details', 'ga4'], pages: ['about', 'services', 'contact'] },
  'levantcounsel.com': { domain: 'levantcounsel.com', name: 'Levant Corporate Counsel', kind: 'live', tagline: 'Commercial counsel', features: ['viewport', 'responsive', 'meta_description', 'case_studies', 'contact_form', 'testimonials', 'contact_details', 'gtm'], pages: ['about', 'services', 'contact'] },
  'gatewaylegaladvisors.ae': { domain: 'gatewaylegaladvisors.ae', name: 'Gateway Legal Advisors', kind: 'live', tagline: 'Legal advisory', features: ['viewport', 'responsive', 'meta_description', 'client_logos', 'contact_form', 'click_to_call', 'contact_details'], pages: ['about', 'services', 'contact'] },
  'saharalawchambers.ae': { domain: 'saharalawchambers.ae', name: 'Sahara Law Chambers', kind: 'live', tagline: 'Litigation and corporate services', features: ['viewport', 'meta_description', 'contact_form', 'contact_details'], pages: ['about', 'contact'] },

  'nilestoneindustries.com': { domain: 'nilestoneindustries.com', name: 'Nile Stone Industries', kind: 'live', tagline: 'Marble and granite fabrication', features: ['viewport', 'responsive', 'meta_description', 'quote_request', 'contact_form', 'whatsapp_link', 'click_to_call', 'case_studies', 'certifications', 'contact_details', 'ga4'], pages: ['about', 'products', 'contact'] },
  'atlasmarblegroup.com': { domain: 'atlasmarblegroup.com', name: 'Atlas Marble Group', kind: 'live', tagline: 'Natural stone supplier', features: ['viewport', 'responsive', 'meta_description', 'quote_request', 'case_studies', 'certifications', 'whatsapp_link', 'contact_details', 'gtm'], pages: ['products', 'about', 'contact'] },
  'deltagraniteco.com': { domain: 'deltagraniteco.com', name: 'Delta Granite Co', kind: 'live', tagline: 'Granite and quartz', features: ['viewport', 'meta_description', 'click_to_call', 'contact_details', 'contact_form'], pages: ['products', 'contact'] },

  'beirutcoals.ae': { domain: 'beirutcoals.ae', name: 'Beirut Coals', kind: 'live', tagline: 'Lebanese charcoal grill', features: ['viewport', 'responsive', 'meta_description', 'booking_link', 'click_to_call', 'whatsapp_link', 'reviews', 'contact_details', 'ga4'], pages: ['about', 'contact'] },
  'zaatarhouse.ae': { domain: 'zaatarhouse.ae', name: 'Zaatar House', kind: 'live', tagline: 'Levantine dining', features: ['viewport', 'meta_description', 'click_to_call', 'contact_details', 'reviews'], pages: ['contact'] },
  'fireandcedar.ae': { domain: 'fireandcedar.ae', name: 'Fire & Cedar', kind: 'live', tagline: 'Charcoal grill', features: ['viewport', 'responsive', 'meta_description', 'click_to_call', 'whatsapp_link', 'booking_link', 'contact_details'], pages: ['about', 'contact'] },

  'routemind.io': { domain: 'routemind.io', name: 'RouteMind', kind: 'live', tagline: 'Delivery management platform', features: ['viewport', 'responsive', 'canonical', 'meta_description', 'demo_request', 'pricing', 'case_studies', 'client_logos', 'contact_form', 'live_chat', 'ga4', 'gtm'], pages: ['products', 'pricing', 'about', 'contact', 'blog'] },
  'fleetcanvas.com': { domain: 'fleetcanvas.com', name: 'FleetCanvas', kind: 'live', tagline: 'Fleet operations software', features: ['viewport', 'responsive', 'canonical', 'meta_description', 'demo_request', 'pricing', 'case_studies', 'testimonials', 'contact_form', 'ga4'], pages: ['products', 'pricing', 'about', 'contact'] },
  'cargoloop.app': { domain: 'cargoloop.app', name: 'Cargo Loop', kind: 'live', tagline: 'Last-mile delivery SaaS', features: ['viewport', 'responsive', 'meta_description', 'demo_request', 'client_logos', 'contact_form', 'gtm'], pages: ['products', 'about', 'contact'] },
};

export function findSiteSpec(domain: string): SiteSpec | null {
  return SITE_SPECS[domain] ?? COMPETITOR_SITE_SPECS[domain] ?? null;
}
