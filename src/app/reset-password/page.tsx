'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft } from 'lucide-react';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [step, setStep] = useState<'send' | 'verify'>('send');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Check if we have a token, validate it
  useEffect(() => {
    if (token) {
      setStep('verify');
      validateToken(token);
    }
  }, [token]);

  const validateToken = async (tokenToValidate: string) => {
    try {
      const res = await fetch('/api/auth/reset-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToValidate }),
      });
      const data = await res.json();
      setTokenValid(data.valid);
      if (!data.valid) {
        setError(data.error || '令牌无效');
      }
    } catch {
      setError('验证失败');
      setTokenValid(false);
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '发送失败');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('密码至少需要 6 个字符');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setResetting(true);

    try {
      const res = await fetch('/api/auth/reset-password/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '重置失败');
      }

      router.push('/login?reset=success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {/* Logo + 标题 */}
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

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Subscribe Anything
          </p>

          <p className="text-sm text-gray-600 dark:text-gray-400">
            {step === 'send' ? '重置密码' : '设置新密码'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {step === 'send' && (
          <>
            {success ? (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm">
                <p>重置邮件已发送到您的邮箱。</p>
                <p className="mt-2">邮件链接有效期 15 分钟，请及时查收。</p>
              </div>
            ) : (
              <form onSubmit={handleSendEmail} className="space-y-4">
                <div>
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    disabled={loading}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? '发送中...' : '发送重置邮件'}
                </Button>
              </form>
            )}
          </>
        )}

        {step === 'verify' && (
          <>
            {tokenValid === null ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">验证中...</p>
              </div>
            ) : tokenValid === false ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  重置链接无效或已过期。请重新发起密码重置。
                </p>
                <Button
                  onClick={() => router.push('/reset-password')}
                  className="w-full"
                >
                  重新发送
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <Label htmlFor="newPassword">新密码</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="至少 6 个字符"
                    required
                    minLength={6}
                    disabled={resetting}
                  />
                </div>

                <div>
                  <Label htmlFor="confirmPassword">确认密码</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入新密码"
                    required
                    minLength={6}
                    disabled={resetting}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={resetting}>
                  {resetting ? '重置中...' : '确认重置'}
                </Button>
              </form>
            )}
          </>
        )}

        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/login')}
            className="text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回登录
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
