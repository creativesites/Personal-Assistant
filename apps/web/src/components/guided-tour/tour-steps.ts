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
  tabToOpen?: string
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
      'Welcome to Zuri Document Studio! Effortlessly manage the full quote-to-invoice-to-receipt lifecycle across 16 commercial, legal, and financial document formats.',
    targetSelector: '[data-tour="doc-header"]',
    badge: '📄 Documents OS',
    iconName: 'FileText',
    actionHint: 'Full commercial & legal document lifecycle',
    placement: 'bottom',
    tabToOpen: 'documents',
    requiresSidebar: false,
  },
  {
    id: 'doc_stats',
    title: 'Real-Time Financial KPI Radar',
    description:
      'Instantly track draft documents, generated PDFs, and paid/accepted revenues. Keep complete visibility over your sales pipeline and cash flow.',
    targetSelector: '[data-tour="doc-stats"]',
    badge: '📊 Financial Radar',
    iconName: 'Building2',
    placement: 'bottom',
    tabToOpen: 'documents',
    requiresSidebar: false,
  },
  {
    id: 'doc_creation',
    title: 'Manual & AI-Powered Document Creation',
    description:
      'Create contracts, invoices, and quotes manually with rich dynamic fields, or describe what you need in plain English and let Zuri AI generate it in seconds.',
    targetSelector: '[data-tour="doc-actions"]',
    badge: '⚡ Fast Creation',
    iconName: 'Sparkles',
    placement: 'bottom',
    tabToOpen: 'documents',
    requiresSidebar: false,
  },
  {
    id: 'doc_library_actions',
    title: '1-Click Actions: Preview, Duplicate & WhatsApp Send',
    description:
      'Every document comes with 1-click superpowers: view crisp vector PDFs, duplicate past quotes into new drafts, copy customer payment links, or send PDFs directly to WhatsApp.',
    targetSelector: '[data-tour="doc-card-actions"]',
    badge: '💬 WhatsApp & Actions',
    iconName: 'MessageSquare',
    placement: 'top',
    tabToOpen: 'documents',
    requiresSidebar: false,
  },
  {
    id: 'doc_payment_settings',
    title: 'Bank, MoMo & Payment QR Code Settings',
    description:
      'Set up your Bank accounts, Mobile Money (MTN, Telecel, M-Pesa), default payment terms, and upload a payment QR code that embeds directly onto rendered PDF invoices!',
    targetSelector: '[data-tour="doc-tab-payments"]',
    badge: '💳 Payment Settings',
    iconName: 'Smartphone',
    placement: 'top',
    tabToOpen: 'payments',
    requiresSidebar: false,
  },
  {
    id: 'doc_signatures',
    title: 'HTML5 Canvas E-Signatures & Compliance',
    description:
      'Collect binding digital signatures directly on interactive document share pages with smooth Bézier curve rendering, IP logging, and complete legal audit trails.',
    targetSelector: '[data-tour="doc-tab-signatures"]',
    badge: '✍️ E-Signatures',
    iconName: 'FileText',
    placement: 'top',
    tabToOpen: 'signatures',
    requiresSidebar: false,
  },
  {
    id: 'doc_brand_settings',
    title: 'Brand Studio & Custom Template Palette',
    description:
      'Customize your business logo, primary theme colors, header banners, company addresses, and default legal terms across all 4 document template styles (Minimal, Modern, Classic, Corporate).',
    targetSelector: '[data-tour="doc-tab-brand"]',
    badge: '🎨 Brand Studio',
    iconName: 'Building2',
    placement: 'top',
    tabToOpen: 'brand',
    requiresSidebar: false,
  },
  {
    id: 'doc_more_tools',
    title: 'Business Automation & Recurring Documents',
    description:
      'Automate recurring monthly invoices, auto-send dunning reminders for overdue payments, generate document packs, and analyze customer purchasing likelihoods!',
    targetSelector: '[data-tour="doc-more-tools"]',
    badge: '🤖 Automation & Analytics',
    iconName: 'Zap',
    placement: 'bottom',
    tabToOpen: 'documents',
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

export const STUDIO_TOUR_STEPS: TourStep[] = [
  {
    id: 'studio_welcome',
    title: 'Studio Business Operating System',
    description:
      'Welcome to Studio — your continuous business intelligence & operations engine. Manage catalog, sales, documents, brand identity, and AI workforce in one integrated workspace.',
    targetSelector: '[data-tour="studio-header"]',
    badge: '🏢 Studio OS',
    iconName: 'Sparkles',
    actionHint: 'Your complete business management hub',
    placement: 'bottom',
    tabToOpen: 'overview',
    requiresSidebar: false,
  },
  {
    id: 'studio_overview_advisor',
    title: 'AI Business Advisor & Financial Radar',
    description:
      'Zuri\'s AI advisor knows your catalog, stock levels, suppliers, and customer purchasing history. Get critical stockout warnings, automated PO restocks, and real-time margin advice.',
    targetSelector: '[data-tour="studio-advisor"]',
    badge: '🧠 AI Advisor',
    iconName: 'Brain',
    actionHint: 'Ask queries or request restock POs',
    placement: 'left',
    tabToOpen: 'overview',
    requiresSidebar: false,
  },
  {
    id: 'studio_catalog',
    title: '30s Product Entry & Express Quotation Wizard',
    description:
      'List products with photos and cost margins. Use the Express Quote Wizard to select contacts, confirm line items, add E-Signatures, and export vector PDFs or send via WhatsApp in seconds!',
    targetSelector: '[data-tour="studio-tab-catalog"]',
    badge: '📦 Product Catalog',
    iconName: 'Building2',
    actionHint: 'Fast quote creation & product intelligence',
    placement: 'bottom',
    tabToOpen: 'catalog',
    requiresSidebar: false,
  },
  {
    id: 'studio_services',
    title: 'Service Packages & SOW Proposal Builder',
    description:
      'Offer service packages, hourly consulting, or retainers. Generate quick quotes and Statements of Work directly from service items.',
    targetSelector: '[data-tour="studio-tab-services"]',
    badge: '💼 Services Hub',
    iconName: 'Briefcase',
    actionHint: 'Retainers, SLAs & project proposals',
    placement: 'bottom',
    tabToOpen: 'services',
    requiresSidebar: false,
  },
  {
    id: 'studio_sales',
    title: 'Sales Engine: Quotations, Invoices & Orders',
    description:
      'Complete order lifecycle management! Convert quotes to invoices, track payment status, issue digital receipts, and trigger auto-dunning reminders.',
    targetSelector: '[data-tour="studio-tab-sales"]',
    badge: '💰 Sales & Invoices',
    iconName: 'FileText',
    actionHint: 'Quotes to receipts lifecycle',
    placement: 'bottom',
    tabToOpen: 'sales',
    requiresSidebar: false,
  },
  {
    id: 'studio_brand',
    title: 'Brand Studio & E-Signature Canvas',
    description:
      'Customize company logos, brand color palettes, default invoice footers, and sign binding legal contracts with Bézier-smoothed HTML5 E-Signatures.',
    targetSelector: '[data-tour="studio-tab-brand"]',
    badge: '🎨 Brand Studio',
    iconName: 'Building2',
    actionHint: 'Branding & digital signatures',
    placement: 'bottom',
    tabToOpen: 'brand',
    requiresSidebar: false,
  },
  {
    id: 'studio_knowledge',
    title: 'Knowledge Brain & Document RAG Search',
    description:
      'Upload company PDFs, supplier price lists, or policy docs. Zuri uses vector embeddings so your AI advisor can answer complex business queries accurately.',
    targetSelector: '[data-tour="studio-tab-knowledge"]',
    badge: '📚 Knowledge Brain',
    iconName: 'Search',
    actionHint: 'Semantic RAG vector search',
    placement: 'bottom',
    tabToOpen: 'knowledge',
    requiresSidebar: false,
  },
]

export const INBOX_TOUR_STEPS: TourStep[] = [
  {
    id: 'inbox_welcome',
    title: 'Shared Team Inbox & AI Co-Pilot',
    description:
      'Welcome to Zuri Shared Inbox! Collaborate with team members, view live WhatsApp chats, and leverage AI to draft responses with instant context.',
    targetSelector: '[data-tour="inbox-header"]',
    badge: '💬 Shared Inbox',
    iconName: 'MessageSquare',
    actionHint: 'Real-time collaborative WhatsApp inbox',
    placement: 'bottom',
    requiresSidebar: false,
  },
  {
    id: 'inbox_locking',
    title: 'Active Team Locking & Collision Warning',
    description:
      'Prevents double-replying! When a teammate opens a conversation, Zuri displays live locking badges and collision warnings.',
    targetSelector: '[data-tour="inbox-locking-status"]',
    badge: '🔒 Collision Guard',
    iconName: 'Smartphone',
    actionHint: 'Avoid customer double-contacts',
    placement: 'bottom',
    requiresSidebar: false,
  },
  {
    id: 'inbox_suggestions',
    title: 'AI Voice-Matched Reply Suggestions',
    description:
      'Zuri analyzes incoming customer messages and generates instant, voice-matched reply options. Approve, tweak, or send with 1 click.',
    targetSelector: '[data-tour="inbox-ai-suggestions"]',
    badge: '✨ AI Drafts',
    iconName: 'Sparkles',
    actionHint: '1-click smart replies',
    placement: 'top',
    requiresSidebar: false,
  },
  {
    id: 'inbox_lead_context',
    title: 'Customer Relationship & Lead Intelligence',
    description:
      'See lead scores, stage pipeline, psychological profile, lifetime value, and past business transactions right beside the chat.',
    targetSelector: '[data-tour="inbox-lead-context"]',
    badge: '📊 Lead Context',
    iconName: 'Brain',
    actionHint: 'Complete CRM & transaction history',
    placement: 'left',
    requiresSidebar: false,
  },
  {
    id: 'inbox_quick_actions',
    title: 'Quick Quotation & Document Dispatch',
    description:
      'Draft express quotes, issue payment links, or request E-Signatures directly within the active conversation without leaving the inbox.',
    targetSelector: '[data-tour="inbox-quick-actions"]',
    badge: '⚡ Quick Dispatch',
    iconName: 'Zap',
    actionHint: 'Create quotes & receipts inside chat',
    placement: 'bottom',
    requiresSidebar: false,
  },
]
