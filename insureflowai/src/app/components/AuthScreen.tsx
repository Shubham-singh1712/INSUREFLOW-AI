'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Eye, EyeOff, ShieldCheck, ArrowRight, ChevronRight,
  Mail, Lock, User, Building2, Briefcase, CheckCircle2,
  Copy, Check, Zap, TrendingUp, FileCheck, AlertCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';

type AuthMode = 'login' | 'signup' | 'forgot';

interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface SignupFormData {
  fullName: string;
  organization: string;
  role: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
}

interface ForgotFormData {
  email: string;
}

const mockCredentials = [
  { role: 'Admin', email: 'admin@apollohospitals.in', password: 'Apollo@Admin2026' },
  { role: 'Insurance Desk', email: 'sneha.rajan@apollohospitals.in', password: 'InsureDesk@2026' },
];

const brandStats = [
  { label: 'Rejection Rate Reduced', value: '68%', icon: TrendingUp, color: 'text-success' },
  { label: 'Claims Validated Today', value: '1,247', icon: FileCheck, color: 'text-info' },
  { label: 'AI Accuracy Score', value: '97.3%', icon: ShieldCheck, color: 'text-warning' },
];

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const loginForm = useForm<LoginFormData>({ defaultValues: { rememberMe: false } });
  const signupForm = useForm<SignupFormData>();
  const forgotForm = useForm<ForgotFormData>();

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleCredentialFill = (cred: typeof mockCredentials[0]) => {
    loginForm.setValue('email', cred.email);
    loginForm.setValue('password', cred.password);
  };

  const onLoginSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        loginForm.setError('email', { message: payload.error || 'Unable to sign in' });
        return;
      }

      const nextPath = new URLSearchParams(window.location.search).get('next');
      router.push(nextPath || '/main-dashboard');
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  };

  const onSignupSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        signupForm.setError('email', { message: payload.error || 'Unable to create account' });
        return;
      }

      setMode('login');
      loginForm.setValue('email', data.email);
    } finally {
      setIsLoading(false);
    }
  };

  const onForgotSubmit = async (data: ForgotFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        forgotForm.setError('email', { message: payload.error || 'Unable to send reset link' });
        return;
      }

      setForgotSuccess(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col w-[52%] bg-sidebar-bg relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-primary translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-accent translate-x-[-30%] translate-y-1/3" />
        </div>

        <div className="relative z-10 flex flex-col h-full px-12 py-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <AppLogo size={36} />
            <div>
              <span className="font-bold text-white text-xl leading-tight block">InsureFlow AI</span>
              <span className="text-xs text-slate-300 font-medium">Enterprise Healthcare Claims Platform</span>
            </div>
          </div>

          {/* Main headline */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-300/40 text-xs font-semibold text-blue-200 mb-4">
                <Zap size={11} /> AI-Powered Validation Engine
              </span>
            </div>
            <h1 className="text-4xl font-bold text-white leading-tight mb-4 text-balance">
              Repair, Don't Reject.
            </h1>
            <p className="text-slate-200 text-base leading-relaxed max-w-sm mb-10">
              AI-powered insurance claim validation that catches issues before submission — reducing rejections by up to 68% across hospital networks.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-10">
              {brandStats.map((stat) => (
                <div key={`stat-${stat.label}`} className="bg-white/10 border border-white/15 rounded-2xl p-4">
                  <stat.icon size={18} className={`${stat.color} mb-2`} />
                  <p className="text-xl font-bold text-white font-tabular">{stat.value}</p>
                  <p className="text-xs text-slate-200 leading-tight mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Feature list */}
            <div className="space-y-3">
              {[
                'OCR document extraction with 97%+ accuracy',
                'Signature & blur detection on all uploads',
                'AI repair suggestions with one-click apply',
                'TPA-ready submission packaging',
              ].map((feat) => (
                <div key={`feat-${feat}`} className="flex items-center gap-3">
                  <CheckCircle2 size={15} className="text-success shrink-0" />
                  <span className="text-sm text-slate-200">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Trust badges */}
          <div className="flex items-center gap-4 pt-8 border-t border-white/10">
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <ShieldCheck size={13} /> HIPAA Compliant
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <ShieldCheck size={13} /> ISO 27001
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="text-xs text-slate-300">SOC 2 Type II</div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 py-10 overflow-y-auto">
        {/* Mobile logo */}
        <div className="flex items-center gap-2 mb-8 lg:hidden">
          <AppLogo size={32} />
          <span className="font-bold text-foreground text-lg">InsureFlow AI</span>
        </div>

        <div className="w-full max-w-md fade-in">
          {mode === 'login' && (
            <LoginForm
              form={loginForm}
              onSubmit={onLoginSubmit}
              isLoading={isLoading}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              onForgot={() => setMode('forgot')}
              onSignup={() => setMode('signup')}
              credentials={mockCredentials}
              onCredentialFill={handleCredentialFill}
              onCopy={handleCopy}
              copiedField={copiedField}
            />
          )}
          {mode === 'signup' && (
            <SignupForm
              form={signupForm}
              onSubmit={onSignupSubmit}
              isLoading={isLoading}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              showConfirmPassword={showConfirmPassword}
              setShowConfirmPassword={setShowConfirmPassword}
              onLogin={() => setMode('login')}
            />
          )}
          {mode === 'forgot' && (
            <ForgotForm
              form={forgotForm}
              onSubmit={onForgotSubmit}
              isLoading={isLoading}
              success={forgotSuccess}
              onBack={() => { setMode('login'); setForgotSuccess(false); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Login Form ───────────────────────────────────────────────────────────────
function LoginForm({
  form, onSubmit, isLoading, showPassword, setShowPassword,
  onForgot, onSignup, credentials, onCredentialFill, onCopy, copiedField,
}: {
  form: ReturnType<typeof useForm<LoginFormData>>;
  onSubmit: (d: LoginFormData) => void;
  isLoading: boolean;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  onForgot: () => void;
  onSignup: () => void;
  credentials: typeof mockCredentials;
  onCredentialFill: (c: typeof mockCredentials[0]) => void;
  onCopy: (text: string, field: string) => void;
  copiedField: string | null;
}) {
  const { register, handleSubmit, formState: { errors } } = form;

  const handleFormSubmit = async (data: LoginFormData) => {
    onSubmit(data);
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-1.5">Welcome back</h2>
        <p className="text-sm text-muted-foreground">Sign in to your InsureFlow AI workspace</p>
      </div>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <div>
          <label className="label">Work Email</label>
          <div className="relative">
            <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
              })}
              type="email"
              placeholder="you@hospital.in"
              className="input-field pl-10"
            />
          </div>
          {errors.email && <p className="error-text">{errors.email.message}</p>}
        </div>

        <div>
          <label className="label">Password</label>
          <div className="relative">
            <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              {...register('password', { required: 'Password is required' })}
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              className="input-field pl-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {errors.password && <p className="error-text">{errors.password.message}</p>}
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input {...register('rememberMe')} type="checkbox" className="w-4 h-4 rounded border-border text-primary" />
            <span className="text-sm text-muted-foreground">Remember me</span>
          </label>
          <button type="button" onClick={onForgot} className="text-sm text-primary font-medium hover:underline">
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full py-3 text-base"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing in...
            </>
          ) : (
            <>Sign In <ArrowRight size={16} /></>
          )}
        </button>
      </form>

      <div className="mt-4 text-center">
        <p className="text-sm text-muted-foreground">
          Don't have an account?{' '}
          <button onClick={onSignup} className="text-primary font-semibold hover:underline">
            Create account
          </button>
        </p>
      </div>

      {/* Demo credentials */}
      <div className="mt-6 rounded-2xl border border-border bg-muted/50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted">
          <AlertCircle size={13} className="text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Demo Credentials — click to autofill</span>
        </div>
        <div className="divide-y divide-border">
          {credentials.map((cred) => (
            <div key={`cred-${cred.role}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors">
              <div>
                <p className="text-xs font-semibold text-foreground">{cred.role}</p>
                <p className="text-xs text-muted-foreground font-tabular">{cred.email}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onCopy(cred.email, `email-${cred.role}`)}
                  className="p-1.5 rounded-lg hover:bg-border transition-colors text-muted-foreground hover:text-foreground"
                  title="Copy email"
                >
                  {copiedField === `email-${cred.role}` ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => onCredentialFill(cred)}
                  className="px-2.5 py-1 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                >
                  Use
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Signup Form ──────────────────────────────────────────────────────────────
function SignupForm({
  form, onSubmit, isLoading, showPassword, setShowPassword,
  showConfirmPassword, setShowConfirmPassword, onLogin,
}: {
  form: ReturnType<typeof useForm<SignupFormData>>;
  onSubmit: (d: SignupFormData) => void;
  isLoading: boolean;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  showConfirmPassword: boolean;
  setShowConfirmPassword: (v: boolean) => void;
  onLogin: () => void;
}) {
  const { register, handleSubmit, watch, formState: { errors } } = form;
  const password = watch('password');

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-1.5">Create your account</h2>
        <p className="text-sm text-muted-foreground">Set up InsureFlow AI for your hospital or clinic</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Full Name</label>
          <div className="relative">
            <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              {...register('fullName', { required: 'Full name is required' })}
              type="text"
              placeholder="Dr. Priya Sharma"
              className="input-field pl-10"
            />
          </div>
          {errors.fullName && <p className="error-text">{errors.fullName.message}</p>}
        </div>

        <div>
          <label className="label">Hospital / Organization</label>
          <div className="relative">
            <Building2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              {...register('organization', { required: 'Organization is required' })}
              type="text"
              placeholder="Apollo Hospitals, Chennai"
              className="input-field pl-10"
            />
          </div>
          {errors.organization && <p className="error-text">{errors.organization.message}</p>}
          <p className="helper-text">Enter the full name of your hospital or healthcare organization</p>
        </div>

        <div>
          <label className="label">Your Role</label>
          <div className="relative">
            <Briefcase size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              {...register('role', { required: 'Role is required' })}
              className="input-field pl-10 appearance-none bg-white"
            >
              <option value="">Select your role</option>
              <option value="billing_executive">Billing Executive</option>
              <option value="insurance_desk">Insurance Desk Operator</option>
              <option value="admin">Hospital Admin</option>
              <option value="compliance_officer">Compliance Officer</option>
              <option value="medical_records">Medical Records Officer</option>
            </select>
            <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground rotate-90 pointer-events-none" />
          </div>
          {errors.role && <p className="error-text">{errors.role.message}</p>}
        </div>

        <div>
          <label className="label">Work Email</label>
          <div className="relative">
            <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
              })}
              type="email"
              placeholder="you@hospital.in"
              className="input-field pl-10"
            />
          </div>
          {errors.email && <p className="error-text">{errors.email.message}</p>}
        </div>

        <div>
          <label className="label">Password</label>
          <div className="relative">
            <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'Password must be at least 8 characters' },
              })}
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a strong password"
              className="input-field pl-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {errors.password && <p className="error-text">{errors.password.message}</p>}
        </div>

        <div>
          <label className="label">Confirm Password</label>
          <div className="relative">
            <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              {...register('confirmPassword', {
                required: 'Please confirm your password',
                validate: v => v === password || 'Passwords do not match',
              })}
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Repeat your password"
              className="input-field pl-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {errors.confirmPassword && <p className="error-text">{errors.confirmPassword.message}</p>}
        </div>

        <div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              {...register('agreeTerms', { required: 'You must agree to the terms' })}
              type="checkbox"
              className="w-4 h-4 rounded border-border text-primary mt-0.5"
            />
            <span className="text-sm text-muted-foreground">
              I agree to the{' '}
              <a href="#" className="text-primary hover:underline font-medium">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-primary hover:underline font-medium">Privacy Policy</a>
            </span>
          </label>
          {errors.agreeTerms && <p className="error-text">{errors.agreeTerms.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full py-3 text-base"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Creating account...
            </>
          ) : (
            <>Create Account <ArrowRight size={16} /></>
          )}
        </button>
      </form>

      <div className="mt-4 text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <button onClick={onLogin} className="text-primary font-semibold hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

// ─── Forgot Password Form ─────────────────────────────────────────────────────
function ForgotForm({
  form, onSubmit, isLoading, success, onBack,
}: {
  form: ReturnType<typeof useForm<ForgotFormData>>;
  onSubmit: (d: ForgotFormData) => void;
  isLoading: boolean;
  success: boolean;
  onBack: () => void;
}) {
  const { register, handleSubmit, formState: { errors } } = form;

  if (success) {
    return (
      <div className="text-center fade-in">
        <div className="w-16 h-16 rounded-full bg-success-bg flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={28} className="text-success" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Check your inbox</h2>
        <p className="text-sm text-muted-foreground mb-6">
          We've sent a password reset link to your work email. The link expires in 30 minutes.
        </p>
        <button onClick={onBack} className="btn-primary w-full">
          Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ChevronRight size={14} className="rotate-180" /> Back to Sign In
      </button>

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-1.5">Reset your password</h2>
        <p className="text-sm text-muted-foreground">Enter your work email and we'll send you a reset link</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Work Email</label>
          <div className="relative">
            <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
              })}
              type="email"
              placeholder="you@hospital.in"
              className="input-field pl-10"
            />
          </div>
          {errors.email && <p className="error-text">{errors.email.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full py-3 text-base"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Sending link...
            </>
          ) : (
            <>Send Reset Link <ArrowRight size={16} /></>
          )}
        </button>
      </form>
    </div>
  );
}
