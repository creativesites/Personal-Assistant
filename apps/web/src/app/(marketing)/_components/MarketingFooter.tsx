import Link from 'next/link'
import { Phone, Mail } from 'lucide-react'

const LINKS = {
  Products: [
    { label: 'Zuri WhatsApp', href: '/whatsapp' },
    { label: 'Zuri Marketing', href: '/marketing' },
    { label: 'How it works', href: '/how-it-works' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Privacy', href: '/privacy' },
  ],
  Industries: [
    { label: 'Online Retail', href: '/retail' },
    { label: 'Clinics & Health', href: '/clinics' },
    { label: 'Real Estate', href: '/real-estate' },
    { label: 'Restaurants', href: '/restaurants' },
    { label: 'Travel & Tourism', href: '/travel' },
    { label: 'Legal Firms', href: '/legal' },
  ],
  Account: [
    { label: 'Sign in', href: '/login' },
    { label: 'Get started', href: '/register' },
    { label: 'Dashboard', href: '/dashboard' },
  ],
}

export function MarketingFooter() {
  return (
    <footer className="bg-gray-50 border-t border-gray-100">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand + contact */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                <img
                  src="https://tnznwohaezrslohtohep.supabase.co/storage/v1/object/public/assets/zuri%20(1).png"
                  alt="Zuri Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="text-gray-900 font-bold text-lg">Zuri</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed mb-5">
              The AI system that runs how small businesses actually sell — from getting discovered on social media to closing the deal on WhatsApp.
            </p>

            {/* Contact details */}
            <div className="space-y-2.5">
              <a
                href="tel:+260979046745"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 transition-colors"
              >
                <Phone className="w-4 h-4 text-gray-400" />
                +260 979 046 745
              </a>
              <a
                href="tel:+260762368105"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 transition-colors"
              >
                <Phone className="w-4 h-4 text-gray-400" />
                +260 762 368 105
              </a>
              <a
                href="mailto:guidelearnai@gmail.com"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 transition-colors"
              >
                <Mail className="w-4 h-4 text-gray-400" />
                guidelearnai@gmail.com
              </a>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(LINKS).map(([section, items]) => (
            <div key={section}>
              <p className="text-gray-900 text-sm font-semibold mb-4">{section}</p>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-400">
            © 2026 Zuri. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-xs">
            <Link href="/privacy" className="text-gray-500 hover:text-indigo-600 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-gray-500 hover:text-indigo-600 transition-colors">
              Terms of Service
            </Link>
            <span className="text-gray-400">Built in Zambia 🇿🇲</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
