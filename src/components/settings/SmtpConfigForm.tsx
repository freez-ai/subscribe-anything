'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';

interface SmtpFormData {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  requireVerification: boolean;
}

interface OAuthFormData {
  configured: boolean;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
}

export default function SmtpConfigForm() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [form, setForm] = useState<SmtpFormData>({
    configured: false,
    host: '',
    port: 465,
    secure: true,
    user: '',
    password: '',
    fromEmail: '',
    fromName: 'Subscribe Anything',
    requireVerification: true,
  });

  const [oauthSaving, setOauthSaving] = useState(false);
  const [hasExistingSecret, setHasExistingSecret] = useState(false);
  const [secretFocused, setSecretFocused] = useState(false);
  const [oauthForm, setOauthForm] = useState<OAuthFormData>({
    configured: false,
    clientId: '',
    clientSecret: '',
    enabled: false,
  });

  useEffect(() => {
    const fetchConfigs = async () => {
      setLoading(true);
      try {
        const [smtpRes, oauthRes] = await Promise.all([
          fetch('/api/settings/smtp'),
          fetch('/api/settings/oauth/google'),
        ]);
        if (smtpRes.ok) {
          const data: SmtpFormData = await smtpRes.json();
          setForm(data);
          setHasExistingPassword(data.configured);
        }
        if (oauthRes.ok) {
          const data: OAuthFormData = await oauthRes.json();
          setOauthForm({ ...data, clientSecret: '' });
          setHasExistingSecret(data.configured);
        }
      } catch {
        toast({
          title: '加载失败',
          description: '无法获取配置',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchConfigs();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/smtp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? '请求失败');
      }

      setHasExistingPassword(true);
      setForm(prev => ({ ...prev, configured: true, password: '' }));
      toast({ title: '保存成功', description: 'SMTP 配置已更新' });
    } catch (err) {
      toast({
        title: '保存失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOAuthSave = async () => {
    setOauthSaving(true);
    try {
      const res = await fetch('/api/settings/oauth/google', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(oauthForm),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? '请求失败');
      }

      setHasExistingSecret(true);
      setOauthForm(prev => ({ ...prev, configured: true, clientSecret: '' }));
      toast({ title: '保存成功', description: 'Google OAuth 配置已更新' });
    } catch (err) {
      toast({
        title: '保存失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setOauthSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast({ title: '请输入测试邮箱', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('/api/settings/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? '发送失败');
      }

      toast({ title: '测试邮件已发送', description: `已发送到 ${testEmail}` });
    } catch (err) {
      toast({
        title: '测试失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const set = (key: keyof SmtpFormData, value: string | number | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const setOauth = (key: keyof OAuthFormData, value: string | boolean) =>
    setOauthForm(prev => ({ ...prev, [key]: value }));

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="py-2 space-y-4">
      {/* Google OAuth Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google OAuth 登录</CardTitle>
          <CardDescription>
            配置 Google OAuth 应用凭据，允许用户通过 Google 账号登录。需要在{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Google Cloud Console
            </a>{' '}
            创建 OAuth 2.0 客户端 ID。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="oauth-enabled"
              checked={oauthForm.enabled}
              onCheckedChange={val => setOauth('enabled', val)}
            />
            <div>
              <Label htmlFor="oauth-enabled">启用 Google 登录</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                开启后，登录页面将显示「使用 Google 登录」按钮
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="oauth-client-id">Client ID</Label>
            <Input
              id="oauth-client-id"
              value={oauthForm.clientId}
              onChange={e => setOauth('clientId', e.target.value)}
              placeholder="xxxxxx.apps.googleusercontent.com"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="oauth-client-secret">Client Secret</Label>
            <Input
              id="oauth-client-secret"
              type="password"
              value={oauthForm.clientSecret}
              onChange={e => setOauth('clientSecret', e.target.value)}
              placeholder={
                hasExistingSecret && !oauthForm.clientSecret
                  ? secretFocused ? '不修改请留空' : '••••••••'
                  : '输入 Client Secret'
              }
              autoComplete="new-password"
              onFocus={() => setSecretFocused(true)}
              onBlur={() => setSecretFocused(false)}
            />
          </div>

          <div className="rounded-md bg-muted px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">配置说明</p>
            <p>在 Google Cloud Console 创建 OAuth 2.0 凭据时，将以下 URL 添加到「已获授权的重定向 URI」：</p>
            <p className="font-mono bg-background px-2 py-1 rounded select-all">
              {typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/auth/oauth/google/callback
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleOAuthSave} disabled={oauthSaving}>
              {oauthSaving ? '保存中...' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SMTP Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SMTP 邮件服务</CardTitle>
          <CardDescription>配置用于发送注册验证码的 SMTP 邮件服务器</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="smtp-require-verification"
              checked={form.requireVerification}
              onCheckedChange={val => set('requireVerification', val)}
            />
            <div>
              <Label htmlFor="smtp-require-verification">开启注册验证码</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                开启后，新用户注册时需要通过邮箱验证码验证身份
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="smtp-host">SMTP 服务器</Label>
              <Input
                id="smtp-host"
                value={form.host}
                onChange={e => set('host', e.target.value)}
                placeholder="smtp.example.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-port">端口</Label>
              <Input
                id="smtp-port"
                type="number"
                value={form.port}
                onChange={e => set('port', Number(e.target.value))}
                placeholder="465"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="smtp-secure"
              checked={form.secure}
              onCheckedChange={val => set('secure', val)}
            />
            <Label htmlFor="smtp-secure">SSL/TLS（推荐开启，端口 465）</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-user">用户名</Label>
            <Input
              id="smtp-user"
              value={form.user}
              onChange={e => set('user', e.target.value)}
              placeholder="your@email.com"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-password">密码 / 授权码</Label>
            <Input
              id="smtp-password"
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder={
                hasExistingPassword && !form.password
                  ? passwordFocused ? '不修改请留空' : '••••••••'
                  : '输入密码或授权码'
              }
              autoComplete="new-password"
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-from-email">发件人邮箱（可选）</Label>
            <Input
              id="smtp-from-email"
              value={form.fromEmail}
              onChange={e => set('fromEmail', e.target.value)}
              placeholder="留空则使用用户名"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-from-name">发件人名称</Label>
            <Input
              id="smtp-from-name"
              value={form.fromName}
              onChange={e => set('fromName', e.target.value)}
              placeholder="Subscribe Anything"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">发送测试邮件</CardTitle>
          <CardDescription>保存配置后，发送一封测试邮件以验证 SMTP 是否正常工作</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="收件人邮箱"
              type="email"
            />
            <Button onClick={handleTest} disabled={testing} variant="outline">
              {testing ? '发送中...' : '发送测试'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
