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
