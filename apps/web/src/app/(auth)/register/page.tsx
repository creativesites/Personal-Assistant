'use client'

import { SignUp } from '@clerk/nextjs'
import { Bot, ShieldCheck, Terminal, Cpu, CheckCircle, Network } from 'lucide-react'

export default function RegisterPage() {
  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col md:flex-row font-sans overflow-hidden">
      
      {/* LEFT PANEL: ONBOARDING TELEMETRY & SYSTEM BUILD MATRIX */}
      <div className="w-full md:w-[45%] lg:w-[40%] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border-r border-slate-900 p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
        
        {/* Background Grid Pattern Overlay */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        {/* Glow ambient effects */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header Segment */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 border border-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-sm font-black tracking-tight text-white block">Zuri OS</span>
            <span className="text-[10px] text-indigo-400 font-mono tracking-widest uppercase">Autonomous Layer</span>
          </div>
        </div>

        {/* Core Architecture Matrix */}
        <div className="relative z-10 my-auto py-12 space-y-6">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
              <Network className="w-3 h-3 text-indigo-400 animate-pulse" /> Environmental Provisions
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-tight">
              Provision Your Dedicated Workspace Account.
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              Deploy your secure, multi-tenant environment. Connect custom communication strings, train internal AI memory modules, and load business rules instantaneously.
            </p>
          </div>

          {/* Interactive Core Integration Step Indicators */}
          <div className="space-y-2.5 max-w-xs">
            <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-900/40 border border-slate-850">
              <div className="w-5 h-5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-mono text-[10px] font-bold">1</div>
              <span className="text-[11px] font-medium text-slate-300">Tenant Namespace Initialization</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-900/40 border border-slate-850">
              <div className="w-5 h-5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-mono text-[10px] font-bold">2</div>
              <span className="text-[11px] font-medium text-slate-300">WhatsApp Data Pipeline Binding</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-900/40 border border-slate-850">
              <div className="w-5 h-5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-mono text-[10px] font-bold">3</div>
              <span className="text-[11px] font-medium text-slate-300">Autonomous Advisor Compilation</span>
            </div>
          </div>
        </div>

        {/* Bottom Infrastructure Security Meta */}
        <div className="relative z-10 flex items-center gap-2 text-[11px] text-slate-500 border-t border-slate-900 pt-4">
          <ShieldCheck className="w-4 h-4 text-indigo-500/70" />
          <span>ISO-27001 Certified Environment Architecture</span>
        </div>
      </div>

      {/* RIGHT PANEL: CLERK INBOUND REGISTRATION PORTAL */}
      <div className="flex-1 bg-slate-950 flex flex-col justify-center items-center p-6 md:p-12 relative overflow-y-auto">
        
        <div className="absolute top-8 right-8 text-[11px] font-mono text-slate-700 hidden sm:block">
          PROVISION_PORTAL // 443
        </div>

        <div className="w-full max-w-md mx-auto flex flex-col justify-center items-center py-8">
          
          {/* Clerk Custom Appearance Injection Wrap Container */}
          <div className="w-full shadow-2xl rounded-2xl overflow-hidden border border-slate-900/40">
            <SignUp 
              appearance={{
                layout: {
                  socialButtonsPlacement: 'bottom',
                  showOptionalFields: false,
                },
                variables: {
                  colorPrimary: '#4f46e5', // Premium Indigo accent match
                  colorBackground: '#020617', // Slate 950 deep profile
                  colorText: '#f8fafc', // Balanced layout text
                  colorTextSecondary: '#94a3b8',
                  colorInputBackground: '#0f172a', // Slate 900 input environments
                  colorInputText: '#ffffff',
                  colorBorder: '#1e293b',
                },
                elements: {
                  rootBox: "w-full",
                  card: "bg-transparent shadow-none p-6 sm:p-8 w-full border-none",
                  headerTitle: "text-xl font-extrabold tracking-tight text-white text-left",
                  headerSubtitle: "text-xs text-slate-400 text-left mt-1",
                  socialButtonsBlockButton: "bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 transition-all text-xs font-semibold rounded-xl py-2.5",
                  dividerLine: "bg-slate-850",
                  dividerText: "text-[10px] text-slate-500 uppercase tracking-widest font-bold",
                  formLabel: "text-slate-400 font-bold text-[11px] uppercase tracking-wider mb-1",
                  formButtonPrimary: "bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/10 mt-2",
                  formFieldInput: "bg-slate-900 border border-slate-800 focus:border-slate-700 text-xs rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none transition-colors",
                  footerActionText: "text-xs text-slate-400",
                  footerActionLink: "text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors",
                }
              }}
            />
          </div>

        </div>
      </div>

    </div>
  )
}
