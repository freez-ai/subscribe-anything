'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from './components/LoginForm';
import { OAuthButtons } from './components/OAuthButtons';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register, loginAsGuest } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);

  const redirect = searchParams.get('redirect') || '/';

  useEffect(() => {
    fetch('/api/auth/register-status')
      .then(r => r.json())
      .then(data => setGoogleOAuthEnabled(!!data.googleOAuthEnabled))
      .catch(() => {});
  }, []);

  const handleSubmit = async (email: string, password: string, name?: string, verificationCode?: string) => {
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        await register(email, password, name, verificationCode);
      } else {
        await login(email, password);
      }
      router.push(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      await loginAsGuest();
      router.push(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `/api/auth/oauth/google?redirect=${encodeURIComponent(redirect)}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {/* Logo + 主标题 */}
          <div className="flex items-center justify-center gap-3 mb-2">
            <img
              src="/favicon-32x32.png"
              alt="Logo"
              className="w-8 h-8"
            />
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              订阅万物
            </h1>
          </div>

          {/* 副标题 - 英文 */}
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Subscribe Anything
          </p>

          <p className="text-sm text-gray-600 dark:text-gray-400">
            {mode === 'login' ? '登录您的账户' : '创建新账户'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <LoginForm
          mode={mode}
          loading={loading}
          onSubmit={handleSubmit}
          onToggleMode={() => setMode(mode === 'login' ? 'register' : 'login')}
        />

        <div className="space-y-3">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                或者
              </span>
            </div>
          </div>

          <OAuthButtons
            onGoogleLogin={handleGoogleLogin}
            onGuestLogin={handleGuestLogin}
            loading={loading}
            googleOAuthEnabled={googleOAuthEnabled}
          />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
