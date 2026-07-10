import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, Package, Sparkles, Image as ImageIcon, Video, Send,
  BarChart3, Repeat, Globe, Camera, Music2, MessageCircle,
} from 'lucide-react'
import { AuthCta } from '../_components/AuthCta'

export const metadata: Metadata = {
  title: 'Zuri Marketing — AI content, scheduling & funnel analytics for Facebook, Instagram, TikTok & WhatsApp',
  description: 'Turn one product into ready-to-post content for Facebook, Instagram, and TikTok, then track every lead all the way from post to WhatsApp sale — in the same system that already runs your WhatsApp CRM.',
}

const FUNNEL_STEPS = [
  { label: 'Products', description: 'Your catalog — one photo per item is enough to start.' },
  { label: 'Content Creation', description: 'AI writes captions, scripts, and generates image variants.' },
  { label: 'Facebook + Instagram + TikTok', description: 'Where Zambian customers discover you.' },
  { label: 'Messenger / WhatsApp', description: 'Where the conversation actually happens and deals close.' },
  { label: 'Sales', description: 'Tracked in the same CRM your WhatsApp inbox already uses.' },
  { label: 'Repeat Customers', description: 'Broadcasts and follow-ups, targeted by what they actually bought.' },
]

const MODULES = [
  {
    icon: Package,
    title: 'AI Product Writer',
    description: 'Upload a product once — get a Facebook post, WhatsApp status text, Instagram caption, and Marketplace description written for you.',
  },
  {
    icon: ImageIcon,
    title: 'AI Image Generator',
    description: 'One product photo becomes several: white background, lifestyle, office, desk-setup — ad-ready in seconds.',
  },
  {
    icon: Video,
    title: 'AI Video Script Generator',
    description: '15-second, 30-second, and 60-second Reel scripts, written from your actual product specs — not a blank page.',
  },
  {
    icon: Send,
    title: 'One-Click Publishing',
    description: 'Schedule and publish to your connected Facebook, Instagram, and TikTok accounts without leaving Zuri.',
  },
  {
    icon: BarChart3,
    title: 'Funnel Analytics',
    description: "See which specific posts produced which specific WhatsApp leads — and which of those became sales.",
  },
  {
    icon: Repeat,
    title: 'Repeat Customer Marketing',
    description: 'Broadcasts and win-back messages targeted by what a customer actually viewed and bought — not a blind blast.',
  },
]

const WORKFLOW = [
  { step: '01', title: 'Upload a product', description: 'A photo and a few specs — that\'s the only manual step.' },
  { step: '02', title: 'AI writes and designs', description: 'Descriptions, captions, a video script, and image variants — generated together.' },
  { step: '03', title: 'Schedule across platforms', description: 'Facebook, Instagram, and TikTok, from one place, on a schedule that fits your day.' },
  { step: '04', title: 'Leads land in your WhatsApp inbox', description: 'The same inbox, contact profiles, and AI reply drafts you already use.' },
  { step: '05', title: 'Mark the sale', description: 'The customer enters your CRM with full history — what they saw, what they asked, what they bought.' },
  { step: '06', title: 'Zuri remembers for next time', description: 'Future promotions target this customer based on real purchase and interest data.' },
]

const PLATFORMS = [
  { icon: Globe, label: 'Facebook', note: 'Pages, Marketplace-style posts & Groups content' },
  { icon: Camera, label: 'Instagram', note: 'Feed posts, carousels & Reels' },
  { icon: Music2, label: 'TikTok', note: 'AI-written scripts today, native publishing as platform access rolls out' },
  { icon: MessageCircle, label: 'WhatsApp', note: 'Where it all closes — powered by the Zuri you already use' },
]

export default function MarketingProductPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-white py-16 md:py-24 px-4 md:px-6">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-100/50 rounded-full blur-3xl -z-10" />
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full text-sm font-medium text-gray-600 mb-6 shadow-sm">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            Coming soon to Zuri — early access opening now
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6 tracking-tight">
            One product in.
            <br />
            <span className="text-indigo-600">A full sales funnel out.</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto mb-8">
            Zuri Marketing turns a single product upload into ready-to-post content for Facebook, Instagram, and
            TikTok — then tracks every lead all the way to a WhatsApp sale, in the same system that already runs
            your inbox and CRM.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <AuthCta
              className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-lg shadow-indigo-200 text-base"
              loggedOut={{ href: '/register', children: <>Get early access<ArrowRight className="w-4 h-4" /></> }}
              loggedIn={{ href: '/studio', children: <>Open Studio<ArrowRight className="w-4 h-4" /></> }}
            />
            <Link
              href="/whatsapp"
              className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-base"
            >
              See Zuri WhatsApp
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <p className="text-sm text-gray-500">
            Existing Zuri WhatsApp customers get first access as this rolls out.
          </p>
        </div>
      </section>

      {/* Funnel */}
      <section className="py-16 md:py-20 px-4 md:px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">The funnel</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Everything feeds into WhatsApp — because that&apos;s where you actually close
            </h2>
          </div>

          <div className="space-y-3">
            {FUNNEL_STEPS.map((step, i) => (
              <div key={step.label} className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{step.label}</p>
                  <p className="text-sm text-gray-500">{step.description}</p>
                </div>
                {i < FUNNEL_STEPS.length - 1 && (
                  <ArrowRight className="hidden sm:block w-4 h-4 text-gray-300 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules */}
      <section className="py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">What it does</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Stop starting from a blank caption every time
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-lg">
              One product upload generates everything a solo shop owner would otherwise spend hours making by hand.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((mod) => {
              const Icon = mod.icon
              return (
                <div key={mod.title} className="p-6 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all duration-200">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1.5">{mod.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{mod.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Platforms */}
      <section className="bg-gray-50 py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">Where your customers are</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Built on the platforms Zambian businesses already use
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {PLATFORMS.map((platform) => {
              const Icon = platform.icon
              return (
                <div key={platform.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
                  <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <p className="font-semibold text-gray-900 text-sm mb-1.5">{platform.label}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{platform.note}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">From upload to repeat customer</h2>
          </div>

          <div className="space-y-4">
            {WORKFLOW.map((item) => (
              <div key={item.step} className="flex gap-5 items-start bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                  {item.step}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-indigo-600 py-16 md:py-20 px-4 md:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Start with Zuri WhatsApp today.
            <br />
            Get Marketing tools first when they launch.
          </h2>
          <p className="text-indigo-200 mb-8">
            Zuri Marketing rolls out to existing customers first. The best way to be ready is to already be running
            your WhatsApp on Zuri.
          </p>
          <AuthCta
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors shadow-lg text-base"
            loggedOut={{ href: '/register', children: <>Start free today<ArrowRight className="w-4 h-4" /></> }}
            loggedIn={{ href: '/studio', children: <>Open Studio<ArrowRight className="w-4 h-4" /></> }}
          />
          <p className="text-indigo-300 text-sm mt-4">No credit card required · Set up in 60 seconds</p>
        </div>
      </section>
    </div>
  )
}
