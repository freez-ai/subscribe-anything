'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LoginFormProps {
  mode: 'login' | 'register';
  loading: boolean;
  onSubmit: (email: string, password: string, name?: string, verificationCode?: string) => void;
  onToggleMode: () => void;
}

export function LoginForm({ mode, loading, onSubmit, onToggleMode }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  // Fetch whether this registration requires email verification
  useEffect(() => {
    if (mode !== 'register') return;
    fetch('/api/auth/register-status')
      .then(r => r.json())
      .then(data => setNeedsVerification(!!data.needsVerification))
      .catch(() => setNeedsVerification(false));
  }, [mode]);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = useCallback(async () => {
    if (!email || countdown > 0) return;

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('请输入有效的邮箱地址');
      return;
    }

    setSendingCode(true);
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '发送验证码失败');
        return;
      }

      setCodeSent(true);
      setCountdown(60); // 60 seconds countdown
    } catch (err) {
      alert('发送验证码失败，请稍后重试');
    } finally {
      setSendingCode(false);
    }
  }, [email, countdown]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(
      email,
      password,
      mode === 'register' ? name : undefined,
      mode === 'register' && needsVerification ? verificationCode : undefined,
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === 'register' && (
        <div>
          <Label htmlFor="name">姓名（可选）</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="您的名字"
            disabled={loading}
          />
        </div>
      )}

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

      {mode === 'register' && needsVerification && (
        <div>
          <Label htmlFor="verificationCode">验证码</Label>
          <div className="flex gap-2">
            <Input
              id="verificationCode"
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6位数字验证码"
              required
              maxLength={6}
              disabled={loading}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleSendCode}
              disabled={loading || sendingCode || countdown > 0 || !email}
              className="whitespace-nowrap"
            >
              {sendingCode ? '发送中...' : countdown > 0 ? `${countdown}秒` : codeSent ? '重新发送' : '发送验证码'}
            </Button>
          </div>
          {codeSent && (
            <p className="text-xs text-gray-500 mt-1">验证码已发送到您的邮箱，有效期5分钟</p>
          )}
        </div>
      )}

      <div>
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少6个字符"
          required
          minLength={6}
          disabled={loading}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
      </Button>

      <div className="text-center text-sm">
        <button
          type="button"
          onClick={onToggleMode}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          {mode === 'login' ? '没有账户？立即注册' : '已有账户？立即登录'}
        </button>
      </div>
    </form>
  );
}
