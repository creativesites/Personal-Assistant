import Link from 'next/link'

const LINKS = {
  Product: [
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
    <footer className="bg-gray-950 text-gray-400">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <span className="text-white text-sm font-bold">Z</span>
              </div>
              <span className="text-white font-bold text-lg">Zuri</span>
            </div>
            <p className="text-sm leading-relaxed mb-4">
              AI-powered relationship intelligence for WhatsApp. Never let an important connection fade.
            </p>
            <p className="text-xs text-gray-600">Built for Africa. Trusted everywhere.</p>
          </div>

          {Object.entries(LINKS).map(([section, items]) => (
            <div key={section}>
              <p className="text-white text-sm font-semibold mb-4">{section}</p>
              <ul className="space-y-2.5">
                {items.map(item => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-sm hover:text-white transition-colors">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs">© 2025 Zuri. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
