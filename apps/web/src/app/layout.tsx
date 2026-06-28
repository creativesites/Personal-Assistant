import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/providers'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Zuri — WhatsApp CRM for Growing Businesses',
  description: 'AI-powered WhatsApp platform that turns conversations into customers. Smart inbox, lead scoring, broadcast campaigns, and AI agents — built for African businesses.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
