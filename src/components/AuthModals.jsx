import React, { useState } from 'react';
import { loginUser, registerUser } from '../services/api';

export default function AuthModals({
  showLogin,
  showRegister,
  onClose,
  onSuccess,
  onSwitchToRegister,
  onSwitchToLogin,
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!showLogin && !showRegister) return null;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await loginUser(email, password);
      onSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await registerUser(name, email, password);
      onSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err.message || 'Registration failed. Please check inputs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-md bg-navy-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          title="Close modal"
        >
          ✕
        </button>

        {showLogin && (
          <div>
            <div className="mb-6">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Authentication</span>
              <h2 className="text-2xl font-bold text-white mt-1">Sign In to Account</h2>
              <p className="text-xs text-slate-400 mt-1">
                Access your personal crash reports and incident registry.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <span>⚠️</span> <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 hover:brightness-110 disabled:opacity-50 transition-all"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-800 text-center text-xs text-slate-400">
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => { setError(''); onSwitchToRegister(); }}
                className="text-cyan-400 hover:text-cyan-300 font-semibold ml-1 underline"
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {showRegister && (
          <div>
            <div className="mb-6">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Registration</span>
              <h2 className="text-2xl font-bold text-white mt-1">Create an Account</h2>
              <p className="text-xs text-slate-400 mt-1">
                Register to submit verified crash reports and track safe routes.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <span>⚠️</span> <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 hover:brightness-110 disabled:opacity-50 transition-all"
              >
                {loading ? 'Creating Account...' : 'Register'}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-800 text-center text-xs text-slate-400">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setError(''); onSwitchToLogin(); }}
                className="text-blue-400 hover:text-blue-300 font-semibold ml-1 underline"
              >
                Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
