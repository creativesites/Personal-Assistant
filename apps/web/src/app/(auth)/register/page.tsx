'use client'

import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'
import { Zap, Users, Bell, ShieldCheck, ArrowLeft, Home } from 'lucide-react'

export default function RegisterPage() {
  return (
    <div className="min-h-screen w-full bg-white flex flex-col md:flex-row font-sans">
      
      {/* LEFT PANEL: VALUE PROPOSITION */}
      <div className="w-full md:w-1/2 lg:w-[45%] bg-gradient-to-br from-indigo-50 via-white to-blue-50 border-r border-gray-100 p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
        
        {/* Subtle decorative circles */}
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-indigo-100 rounded-full opacity-40 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-blue-100 rounded-full opacity-30 pointer-events-none" />

        {/* Logo & Brand */}
        <div className="relative z-10 flex items-center gap-3 mb-8">
          <img
            src="https://tnznwohaezrslohtohep.supabase.co/storage/v1/object/public/assets/zuri%20(1).png"
            alt="Zuri Logo"
            className="w-10 h-10 rounded-lg"
          />
          <div>
            <h1 className="text-xl font-bold text-gray-800">Zuri</h1>
            <p className="text-xs text-indigo-500 font-medium">AI for your WhatsApp</p>
          </div>
        </div>

        {/* Main Benefit Statement */}
        <div className="relative z-10 my-auto py-8 space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight">
              Start growing your business today.
              <span className="block text-indigo-600">Customer conversations, made effortless.</span>
            </h2>
            <p className="text-sm text-gray-500 max-w-md leading-relaxed">
              Connect your WhatsApp, and Zuri will learn your customers, suggest replies that sound like you,
              and remind you when to follow up. No tech skills needed — it works in minutes.
            </p>
          </div>

          {/* Key Benefits — simple, conversational */}
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">Reply faster with AI</p>
                <p className="text-xs text-gray-400">Get instant reply suggestions that match your tone, so you never keep a customer waiting.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">Know every lead</p>
                <p className="text-xs text-gray-400">Zuri automatically builds customer profiles with lead scores, interests, and history.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                <Bell className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">Never miss a follow‑up</p>
                <p className="text-xs text-gray-400">Get reminders when a lead goes quiet or a promise is due — automatically.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: trust message, back to home, back to login */}
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-gray-400 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-500" />
            <span>No credit card required. Cancel anytime.</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1 text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              <Home className="w-4 h-4" />
              Home
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Sign in
            </Link>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: SIGN UP FORM */}
      <div className="flex-1 bg-white flex flex-col justify-center items-center p-6 md:p-12 relative">
        <div className="w-full max-w-md mx-auto flex flex-col justify-center items-center">
          <div className="w-full shadow-xl rounded-2xl overflow-hidden border border-gray-100 bg-white">
            <SignUp
              appearance={{
                layout: {
                  socialButtonsPlacement: 'bottom',
                  showOptionalFields: false,
                },
                variables: {
                  colorPrimary: '#4f46e5',
                  colorBackground: '#ffffff',
                  colorText: '#1e293b',
                  colorTextSecondary: '#64748b',
                  colorInputBackground: '#f8fafc',
                  colorInputText: '#1e293b',
                  colorBorder: '#e2e8f0',
                },
                elements: {
                  rootBox: "w-full",
                  card: "bg-transparent shadow-none p-6 sm:p-8 w-full border-none",
                  headerTitle: "text-xl font-bold text-gray-800 text-left",
                  headerSubtitle: "text-sm text-gray-500 text-left mt-1",
                  socialButtonsBlockButton: "bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 transition-all text-sm font-medium rounded-xl py-2.5",
                  dividerLine: "bg-gray-200",
                  dividerText: "text-xs text-gray-400 uppercase tracking-wider font-bold",
                  formLabel: "font-semibold text-sm text-gray-700 mb-1",
                  formButtonPrimary: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/10 mt-2",
                  formFieldInput: "bg-gray-50 border border-gray-200 focus:border-indigo-400 text-sm rounded-xl px-3 py-2.5 text-gray-800 placeholder-gray-400 focus:outline-none transition-colors",
                  footerActionText: "text-sm text-gray-500",
                  footerActionLink: "text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors",
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
