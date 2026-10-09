import React, { useState, useEffect } from 'react';
import { UserAccount } from '../types';
import { authFetch, setSessionToken, removeSessionToken } from '../utils/api';
import { X, Lock, Mail, User, ShieldCheck, ArrowRight, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface AuthModalProps {
  currentUser: UserAccount | null;
  isOpen: boolean;
  onClose: () => void;
  onUserChanged: (user: UserAccount) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onUserChanged,
}) => {
  const [mode, setMode] = useState<'switch' | 'login' | 'register'>('switch');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Available test accounts for rapid switching
  const [testAccounts, setTestAccounts] = useState<Array<{
    id: string;
    email: string;
    plan: string;
    creditsRemaining: number;
    totalScansCount: number;
  }>>([]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccess(null);
      loadAccounts();
    }
  }, [isOpen]);

  const loadAccounts = async () => {
    try {
      const res = await authFetch('/api/auth/accounts');
      if (res.ok) {
        const data = await res.json();
        setTestAccounts(data);
      }
    } catch {
      // Ignore
    }
  };

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sign in.');
      }

      setSessionToken(data.token);
      onUserChanged(data.user);
      setSuccess('Signed in successfully.');
      setTimeout(() => onClose(), 600);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed.');
      }

      setSessionToken(data.token);
      onUserChanged(data.user);
      setSuccess('Account created! 10 free minutes added.');
      setTimeout(() => onClose(), 600);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async (targetUserId: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/auth/switch-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to switch account.');
      }

      setSessionToken(data.token);
      onUserChanged(data.user);
      setSuccess(`Switched to ${data.user.email}`);
      setTimeout(() => onClose(), 500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    removeSessionToken();
    // Re-fetch default user
    const res = await fetch('/api/user');
    if (res.ok) {
      const defaultUser = await res.json();
      onUserChanged(defaultUser);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs">
      <div 
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden text-stone-900 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-rose-500" />
            <h2 className="font-bold text-base tracking-tight">Account & Ownership</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active User Banner */}
        <div className="px-6 py-3 bg-stone-100 border-b border-stone-200 flex items-center justify-between text-xs">
          <div>
            <span className="text-stone-500">Active Identity: </span>
            <span className="font-semibold text-stone-800">{currentUser?.email || 'Guest User'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded uppercase font-bold text-[10px] bg-stone-200 text-stone-700">
              {currentUser?.plan || 'Free'}
            </span>
            <span className="font-semibold text-emerald-600">
              {currentUser?.creditsRemaining ?? 0}m
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-stone-200 bg-stone-50/50 text-xs font-semibold">
          <button
            onClick={() => { setMode('switch'); setError(null); }}
            className={`flex-1 py-3 text-center transition-colors border-b-2 ${
              mode === 'switch'
                ? 'border-rose-600 text-stone-900 bg-white font-bold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Switch Account
          </button>
          <button
            onClick={() => { setMode('login'); setError(null); }}
            className={`flex-1 py-3 text-center transition-colors border-b-2 ${
              mode === 'login'
                ? 'border-rose-600 text-stone-900 bg-white font-bold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('register'); setError(null); }}
            className={`flex-1 py-3 text-center transition-colors border-b-2 ${
              mode === 'register'
                ? 'border-rose-600 text-stone-900 bg-white font-bold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Register
          </button>
        </div>

        {/* Feedback Notices */}
        <div className="px-6 pt-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}
        </div>

        {/* Tab 1: Instant Switch Test Accounts */}
        {mode === 'switch' && (
          <div className="p-6 space-y-4">
            <div>
              <p className="text-xs text-stone-600">
                Select an isolated creator identity to verify that scan archives, reports, and paid subscriptions are strictly scoped:
              </p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {testAccounts.map((acc) => {
                const isSelected = currentUser?.id === acc.id;
                return (
                  <div
                    key={acc.id}
                    onClick={() => !isSelected && handleSwitchAccount(acc.id)}
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900 cursor-default'
                        : 'border-stone-200 hover:border-stone-400 bg-white hover:bg-stone-50/60'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900">{acc.email}</span>
                        {isSelected && (
                          <span className="text-[10px] bg-stone-900 text-white px-1.5 py-0.2 rounded font-semibold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-500 flex items-center gap-2">
                        <span className="capitalize">{acc.plan} Plan</span>
                        <span>·</span>
                        <span className="text-emerald-700 font-semibold">{acc.creditsRemaining} mins available</span>
                        <span>·</span>
                        <span>{acc.totalScansCount} scans</span>
                      </div>
                    </div>

                    {!isSelected && (
                      <button
                        type="button"
                        disabled={loading}
                        className="px-3 py-1 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded text-xs shrink-0 transition-colors"
                      >
                        Switch
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={handleLogout}
                className="text-stone-500 hover:text-stone-800 font-medium"
              >
                Sign out
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className="text-rose-600 hover:text-rose-700 font-semibold"
              >
                + Register New Account
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Standard Sign In */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="creator@videorisk.com"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
              <p className="text-[11px] text-stone-400 mt-1">
                Demo passwords: <code>creator123</code>, <code>pro123</code>, <code>free123</code>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>

            <div className="text-center pt-2 text-xs text-stone-500">
              Don’t have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('register')}
                className="text-rose-600 font-semibold hover:underline"
              >
                Create one
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Register */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@channel.com"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Password (min 6 characters)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
            </div>

            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-[11px] text-stone-600 space-y-1">
              <span className="font-bold text-stone-800 block">✨ Starter Evaluation Included</span>
              <p>Every newly registered account automatically receives 10 free minutes of pre-publish video inspection.</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <span>Register & Claim 10 Minutes</span>
              )}
            </button>

            <div className="text-center pt-2 text-xs text-stone-500">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-rose-600 font-semibold hover:underline"
              >
                Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
