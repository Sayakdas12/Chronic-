'use client'

import React, { useState } from 'react'
import { Eye, EyeOff, ArrowLeft, Shield, Radio, Truck, Satellite } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function LoginPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Login submitted:', formData)
  }

  return (
    <div className="min-h-screen w-screen bg-slate-950 flex flex-col lg:flex-row relative overflow-x-hidden font-sans">
      {/* Floating Back Button */}
      <div className="absolute top-6 left-6 z-30">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900/80 hover:bg-slate-800/90 text-white text-xs font-semibold rounded-full border border-white/10 backdrop-blur-md shadow-lg transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-sky-400" />
          <span>Back to Home</span>
        </button>
      </div>

      {/* Left Panel - Image & Civic Telemetry Section (Perfect Center Alignment) */}
      <div className="flex-1 relative overflow-hidden hidden lg:flex items-center justify-center p-12 bg-slate-950">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/auth-command-center.jpg"
            alt="ChronicAI Command Center"
            className="w-full h-full object-cover opacity-50 scale-105 transition-transform duration-1000"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/75 to-slate-950" />
        </div>

        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold tracking-wider uppercase font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
            <span>District EOC Telemetry Active</span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-white leading-tight">
            One Platform.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">
              Rapid Response.
            </span>
          </h1>

          <p className="text-slate-400 text-sm xl:text-base leading-relaxed">
            Welcome to the ChronicAI operations gateway. Sign in to access synchronized district SitReps, coordinate field response teams, and monitor real-time civic telemetry.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-white/5 backdrop-blur-sm text-xs font-medium text-slate-200">
              <Radio className="w-4 h-4 text-sky-400" />
              <span>24/7 Field Radar</span>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-white/5 backdrop-blur-sm text-xs font-medium text-slate-200">
              <Shield className="w-4 h-4 text-sky-400" />
              <span>Encrypted Routing</span>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-white/5 backdrop-blur-sm text-xs font-medium text-slate-200">
              <Truck className="w-4 h-4 text-sky-400" />
              <span>Resource Dispatch</span>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-white/5 backdrop-blur-sm text-xs font-medium text-slate-200">
              <Satellite className="w-4 h-4 text-sky-400" />
              <span>Ward 7 Live Feeds</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form Section (Symmetrically Aligned) */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-slate-900/80 border-t lg:border-t-0 lg:border-l border-white/5">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white mb-2">
              Welcome Back
            </h2>
            <p className="text-sm text-slate-400">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/signup')}
                className="text-sky-400 hover:text-sky-300 font-semibold cursor-pointer transition-colors"
              >
                Sign up here
              </button>
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Citizen Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="name@example.com"
                className="w-full px-4 py-3 bg-slate-950/70 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-12 bg-slate-950/70 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me + Forgot Password */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleInputChange}
                  className="w-4 h-4 rounded border-white/20 bg-slate-950 text-sky-500 focus:ring-sky-500"
                />
                <span>Remember me</span>
              </label>
              <button
                type="button"
                className="text-sky-400 hover:text-sky-300 font-medium cursor-pointer transition-colors"
              >
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white py-3.5 px-4 rounded-xl text-sm font-semibold shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 active:scale-[0.99] transition-all cursor-pointer"
            >
              Sign In to ChronicAI
            </button>

            {/* Divider */}
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <span className="relative px-3 bg-slate-900 text-xs uppercase tracking-wider text-slate-500 font-mono">
                or continue with
              </span>
            </div>

            {/* Social Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="flex items-center justify-center gap-2.5 px-4 py-2.5 border border-white/10 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 text-xs font-medium text-slate-300 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Google</span>
              </button>

              <button
                type="button"
                className="flex items-center justify-center gap-2.5 px-4 py-2.5 border border-white/10 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 text-xs font-medium text-slate-300 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <span>GitHub</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default LoginPage;
