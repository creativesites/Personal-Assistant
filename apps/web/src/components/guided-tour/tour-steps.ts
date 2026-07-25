import {
  Sparkles,
  Search,
  MessageSquare,
  Smartphone,
  Brain,
  FileText,
  Briefcase,
  HelpCircle,
  Building2,
  Zap,
} from 'lucide-react'

export interface TourStep {
  id: string
  title: string
  description: string
  targetSelector: string
  badge: string
  iconName: string
  actionHint?: string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  route?: string
  requiresSidebar?: boolean
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Zuri AI Relationship OS',
    description:
      'Zuri is your always-on continuous intelligence platform for personal & team relationships, customer engagement, and business operations.',
    targetSelector: '[data-tour="brand-logo"]',
    badge: '👋 Welcome',
    iconName: 'Sparkles',
    actionHint: 'Press → or click Next to explore',
    placement: 'bottom',
    requiresSidebar: true,
  },
  {
    id: 'search',
    title: 'Global Search & Command Palette',
    description:
      'Press ⌘K or click search anytime to instantly find contacts, conversations, documents, quotes, and run instant AI actions.',
    targetSelector: '[data-tour="search-bar"]',
    badge: '⚡ Quick Search',
    iconName: 'Search',
    actionHint: 'Use ⌘K anywhere in Zuri',
    placement: 'bottom',
    requiresSidebar: true,
  },
  {
    id: 'nav_hubs',
    title: 'Four Core Workspace Hubs',
    description:
      'Your workspace is organized into 4 hubs: Inbox Hub, Customers Hub, Operations Hub, and Workspace Settings. Click any hub header to expand or collapse.',
    targetSelector: '[data-tour="nav-hubs"]',
    badge: '📁 Navigation',
    iconName: 'Building2',
    actionHint: 'Organized for peak productivity',
    placement: 'right',
    requiresSidebar: true,
  },
  {
    id: 'inbox',
    title: 'Shared Team Inbox & AI Drafts',
    description:
      'Manage WhatsApp conversations collaboratively. AI automatically prepares voice-matched reply drafts, detects customer sentiment, and prevents team collisions.',
    targetSelector: '[data-tour="inbox-link"]',
    badge: '💬 Shared Inbox',
    iconName: 'MessageSquare',
    actionHint: 'Drafts, sentiment & locking',
    placement: 'right',
    route: '/inbox',
    requiresSidebar: true,
  },
  {
    id: 'whatsapp_status',
    title: 'Live WhatsApp Connection & Pairing',
    description:
      'Check real-time WhatsApp status, pair new phone sessions via QR code or Link Code, and monitor historical background sync progress.',
    targetSelector: '[data-tour="wa-status-widget"]',
    badge: '📱 Connectivity',
    iconName: 'Smartphone',
    actionHint: 'Always connected in the background',
    placement: 'right',
    requiresSidebar: true,
  },
  {
    id: 'ai_advisor',
    title: 'AI Advisor & Proactive Nudges',
    description:
      'Receive intelligent morning coffee feeds, proactive relationship maintenance suggestions, and strategic advice tailored to your goals.',
    targetSelector: '[data-tour="advisor-link"]',
    badge: '🧠 AI Intelligence',
    iconName: 'Brain',
    actionHint: 'Never miss an opportunity',
    placement: 'right',
    requiresSidebar: true,
  },
  {
    id: 'operations',
    title: 'Business ERP, Documents & Signatures',
    description:
      'Generate quotations, invoices, sales orders, manage inventory in Brand Studio, and send HTML5 canvas E-Signatures with automatic dunning.',
    targetSelector: '[data-tour="operations-link"]',
    badge: '📄 Operations',
    iconName: 'FileText',
    actionHint: 'Quotes to receipts lifecycle',
    placement: 'right',
    route: '/business',
    requiresSidebar: true,
  },
  {
    id: 'career',
    title: 'Career OS & CV Studio',
    description:
      'Track executive career goals, analyze job readiness, build tailored AI cover letters, and generate professional PDF CVs directly in Zuri.',
    targetSelector: '[data-tour="career-link"]',
    badge: '💼 Career OS',
    iconName: 'Briefcase',
    actionHint: 'Job scraping & CV builder',
    placement: 'right',
    route: '/career',
    requiresSidebar: true,
  },
  {
    id: 'retrigger_tour',
    title: 'Re-run Product Tour Anytime',
    description:
      'You are all set! You can replay this interactive tour at any time by clicking the Help icon in the header bar or visiting Settings.',
    targetSelector: '[data-tour="tour-trigger"]',
    badge: '🎉 You\'re All Set!',
    iconName: 'HelpCircle',
    actionHint: 'Replay tour anytime',
    placement: 'bottom',
    requiresSidebar: true,
  },
]

export const DOCUMENT_TOUR_STEPS: TourStep[] = [
  {
    id: 'doc_welcome',
    title: 'Document Studio & Lifecycle OS',
    description:
      'Create 16 commercial, legal, and finance document types — from quotes to invoices, receipts, SOWs, NDAs, contracts, and HTML5 canvas E-Signatures.',
    targetSelector: '[data-tour="doc-header"]',
    badge: '📄 Documents OS',
    iconName: 'FileText',
    actionHint: 'Full quote-to-invoice-to-receipt lifecycle',
    placement: 'bottom',
    requiresSidebar: false,
  },
  {
    id: 'doc_templates',
    title: '16 Professional Document Templates',
    description:
      'Choose from Commercial (Invoices, Quotations, Purchase Orders, Delivery Notes), Legal (Contracts, NDAs, SOWs, Proposals), or Finance templates.',
    targetSelector: '[data-tour="doc-type-selector"]',
    badge: '📋 Templates',
    iconName: 'BookOpen',
    actionHint: 'Pick the right format for your workflow',
    placement: 'bottom',
    requiresSidebar: false,
  },
  {
    id: 'doc_client_mandatory',
    title: 'Mandatory Client Details',
    description:
      'Every document requires complete client details. Search CRM contacts to auto-fill or enter name, email, and phone manually.',
    targetSelector: '[data-tour="client-details-section"]',
    badge: '👤 Mandatory Client',
    iconName: 'User',
    actionHint: 'Ensures accurate billing & delivery',
    placement: 'top',
    requiresSidebar: false,
  },
  {
    id: 'doc_company_mandatory',
    title: 'Mandatory Company & Brand Details',
    description:
      'Your business name, logo, address, contact details, and tax ID are required. They automatically sync with your Brand Kit & Business Profiles.',
    targetSelector: '[data-tour="company-details-section"]',
    badge: '🏢 Mandatory Brand',
    iconName: 'Building2',
    actionHint: 'Auto-populated from Brand Kit',
    placement: 'top',
    requiresSidebar: false,
  },
  {
    id: 'doc_catalog_items',
    title: 'Catalog & Line Items Editor',
    description:
      'Add itemized products or packages directly from your Brand Studio inventory with automated tax, discount, and subtotal calculations.',
    targetSelector: '[data-tour="line-items-section"]',
    badge: '📦 Line Items',
    iconName: 'Package',
    actionHint: 'Instant multi-currency calculations',
    placement: 'top',
    requiresSidebar: false,
  },
  {
    id: 'doc_signatures_preview',
    title: 'E-Signatures & Pixel-Perfect PDF',
    description:
      'Attach HTML5 canvas digital signatures, set payment terms, and render crisp vector PDFs ready to send via WhatsApp or email with 1 click.',
    targetSelector: '[data-tour="doc-preview-actions"]',
    badge: '✍️ Sign & Export',
    iconName: 'FileText',
    actionHint: 'E-Signatures & 1-click WhatsApp send',
    placement: 'top',
    requiresSidebar: false,
  },
]

export const CAREER_TOUR_STEPS: TourStep[] = [
  {
    id: 'career_welcome',
    title: 'Career OS & Executive Placement Hub',
    description:
      'Manage executive career opportunities, track job applications, analyze position readiness, and optimize your executive brand.',
    targetSelector: '[data-tour="career-header"]',
    badge: '💼 Career OS',
    iconName: 'Briefcase',
    actionHint: 'AI-powered job matching & placement',
    placement: 'bottom',
    route: '/career',
    requiresSidebar: false,
  },
  {
    id: 'career_job_feed',
    title: 'Scraped Jobs & AI Opportunity Radar',
    description:
      'Browse tailored job listings scraped from top platforms, filtered by salary target, domain, and experience fit score.',
    targetSelector: '[data-tour="career-job-feed"]',
    badge: '🎯 Opportunity Radar',
    iconName: 'Target',
    actionHint: 'Automated job scraping & scoring',
    placement: 'top',
    route: '/career',
    requiresSidebar: false,
  },
  {
    id: 'career_cv_studio',
    title: 'CV Studio & AI Cover Letter Generator',
    description:
      'Build tailored, modern CVs and generate customized cover letters matched to each specific job post in seconds.',
    targetSelector: '[data-tour="career-cv-studio"]',
    badge: '📄 CV & Cover Letter',
    iconName: 'FileText',
    actionHint: 'Export tailored PDF resumes & share web links',
    placement: 'top',
    route: '/career',
    requiresSidebar: false,
  },
]
