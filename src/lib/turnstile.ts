/**
 * Cloudflare Turnstile 验证工具
 * 用于验证用户是否为真人，防止恶意脚本滥用
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * 验证 Turnstile Token
 * @param token 前端返回的 token
 * @param remoteIp 可选的客户端 IP 地址，用于额外验证
 * @returns { success: boolean, error?: string }
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<{ success: boolean; error?: string }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    console.warn('[Turnstile] TURNSTILE_SECRET_KEY not configured, skipping verification');
    // 如果没有配置密钥，可以选择直接通过或拒绝
    // 这里选择通过以避免影响开发环境
    return { success: true };
  }

  if (!token) {
    return { success: false, error: '人机验证失败，请重试' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);

    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData,
    });

    const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };

    if (data.success) {
      return { success: true };
    }

    console.error('[Turnstile] Verification failed:', data['error-codes']);
    return { success: false, error: '人机验证失败，请重试' };
  } catch (error) {
    console.error('[Turnstile] Verification error:', error);
    return { success: false, error: '人机验证失败，请重试' };
  }
}

/**
 * 检查 Turnstile 是否已配置
 */
export function isTurnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

/**
 * 获取前端所需的 site key
 */
export function getTurnstileSiteKey(): string | undefined {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}
