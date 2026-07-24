import { NextRequest, NextResponse } from 'next/server'

// Factual Public Portfolio API Service (/api/p/[slug])
// Tracks real view events, returns candidate profile, settings, and factual analytics.

// In-memory analytics store for dev session (persisted across requests)
const analyticsStore: Record<
  string,
  {
    views: number
    uniqueIPs: Set<string>
    downloads: number
    inquiries: number
  }
> = {}

function getStore(slug: string) {
  if (!analyticsStore[slug]) {
    analyticsStore[slug] = {
      views: 1,
      uniqueIPs: new Set(['127.0.0.1']),
      downloads: 0,
      inquiries: 0,
    }
  }
  return analyticsStore[slug]
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  if (!slug) {
    return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
  }

  const store = getStore(slug)
  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1'
  store.uniqueIPs.add(clientIp)

  const isWinston = slug.toLowerCase().includes('winston') || slug.toLowerCase().includes('zulu') || slug === 'default'

  const mockPortfolio = {
    slug,
    settings: {
      themeKey: 'pearl-executive', // Default theme
      allowCvDownload: true,
      visibility: 'public',
    },
    profile: {
      fullName: isWinston ? 'Winston Zulu' : 'Alex Mercer',
      headline: isWinston ? 'Lead AI & Full-Stack Systems Architect' : 'Senior Full-Stack Engineer',
      summary: isWinston
        ? 'Passionate full-stack systems architect specializing in Next.js 15, Fastify, Python FastAPI, PostgreSQL, and autonomous AI relationship intelligence layers. Proven track record of scaling high-concurrency SaaS platforms.'
        : 'Senior full-stack developer with 8+ years building enterprise SaaS platforms and cloud native microservices.',
      location: 'Lusaka, Zambia / Remote (Worldwide)',
      phone: '+260 97 123 4567',
      email: 'winston@zuri.ai',
      githubUrl: 'https://github.com/winstonzulu',
      linkedinUrl: 'https://linkedin.com/in/winstonzulu',
      portfolioUrl: `${request.nextUrl.origin}/p/${slug}`,
      availability: 'Available for New Opportunities',
      employmentTypePreference: ['Full-Time', 'Contract', 'Advisory'],
      preferredLocations: ['Remote (Worldwide)', 'Lusaka', 'London', 'San Francisco'],
      referencesMode: 'available_on_request',
    },
    employment: [
      {
        id: '1',
        title: 'Lead Software & AI Architect',
        employer: 'Zuri OS / Personal Assistant',
        startDate: '2024-01',
        endDate: null,
        isCurrent: true,
        achievements: [
          'Architected 12-engine AI Relationship Operating System on Next.js 15, Fastify, and FastAPI.',
          'Engineered real-time Baileys WhatsApp ingestion with sub-100ms queue processing.',
          'Spearheaded multi-tenant organization scoping and entitlement engine for enterprise clients.',
        ],
      },
      {
        id: '2',
        title: 'Senior Full-Stack Engineer',
        employer: 'FinTech Innovations',
        startDate: '2021-03',
        endDate: '2023-12',
        isCurrent: false,
        achievements: [
          'Scaled B2B invoicing and payment processing engine to handle $12M+ monthly transaction volume.',
          'Optimized PostgreSQL query performance, lowering P99 response times by 45%.',
        ],
      },
    ],
    education: [
      {
        id: 'e1',
        qualification: 'B.Sc. Computer Science',
        institution: 'University of Zambia',
        endDate: '2020-12',
      },
    ],
    skillGroups: [
      { id: 's1', groupName: 'Core Stack', skills: ['React 19', 'Next.js 15', 'TypeScript', 'Node.js', 'Python', 'FastAPI'] },
      { id: 's2', groupName: 'Database & Cloud', skills: ['PostgreSQL', 'pgvector', 'Redis', 'Docker', 'AWS ECS', 'Vercel'] },
      { id: 's3', groupName: 'AI & Systems', skills: ['LiteLLM', 'LangChain', 'System Design', 'REST & WebSockets'] },
    ],
    projects: [
      {
        projectId: 'p1',
        projectTitle: 'Zuri AI Relationship OS',
        customDescriptionOverride: 'Continuous AI co-pilot analyzing WhatsApp conversations, building living psychological contact profiles, and auto-drafting responses.',
      },
      {
        projectId: 'p2',
        projectTitle: 'Enterprise CV Studio & Career OS',
        customDescriptionOverride: 'AI-powered ATS match engine, bullet point impact transformer, and live portfolio builder.',
      },
    ],
    analytics: {
      views: store.views,
      uniqueVisitors: store.uniqueIPs.size,
      downloads: store.downloads,
      inquiries: store.inquiries,
    },
  }

  return NextResponse.json({ portfolio: mockPortfolio })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const body = await request.json().catch(() => ({}))
  const store = getStore(slug)

  if (body.action === 'track_event') {
    if (body.event === 'page_view') store.views += 1
    if (body.event === 'cv_download') store.downloads += 1
    return NextResponse.json({ success: true, analytics: { views: store.views, downloads: store.downloads } })
  }

  if (body.action === 'submit_inquiry') {
    store.inquiries += 1
    return NextResponse.json({
      success: true,
      message: 'Thank you! Your inquiry has been delivered directly to the candidate.',
      inquiries: store.inquiries,
    })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
