import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/providers'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#4F46E5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Zuri — AI Relationship & Business OS',
  description: 'Continuous intelligence layer for relationships, WhatsApp CRM, document studio, e-signatures, and Career OS.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/zuri.ico' },
      { url: '/zuri-logo.png', type: 'image/png' },
    ],
    apple: [
      { url: '/zuri-logo.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Zuri OS',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/zuri.ico" sizes="any" />
        <link rel="icon" href="/zuri-logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/zuri-logo.png" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased selection:bg-indigo-500 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
