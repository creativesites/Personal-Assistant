import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@react-pdf/renderer', '@zuri/pdf-templates'],
}

export default nextConfig
