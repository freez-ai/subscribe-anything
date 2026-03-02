'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function ReportViewPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await fetch(`/api/reports/${reportId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || '加载报告失败');
          setLoading(false);
          return;
        }
        const report = await res.json();
        setHtml(report.htmlContent);
        setLoading(false);
      } catch (e) {
        setError('网络错误，请重试');
        setLoading(false);
      }
    };

    fetchReport();
  }, [reportId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center text-gray-600">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-300 border-t-gray-600"></div>
          <p className="mt-4">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center text-gray-600">
          <p className="text-red-500 mb-4">{error}</p>
          <p className="text-sm">请关闭此页面返回</p>
        </div>
      </div>
    );
  }

  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{
          __html: `
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.7;
              color: #333;
              padding: 20px;
              background: #fff;
              max-width: 100vw;
              word-wrap: break-word;
            }
            h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; margin-top: 1.5rem; }
            h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem; margin-top: 1.25rem; }
            h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem; margin-top: 1rem; }
            p { margin-bottom: 0.75rem; }
            ul, ol { padding-left: 1.5rem; margin-bottom: 0.75rem; }
            li { margin-bottom: 0.25rem; }
            strong { font-weight: 600; }
            em { font-style: italic; }
            blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; color: #6b7280; margin: 1rem 0; }
            code { background: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-size: 0.875em; }
            hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0; }
            a { color: #2563eb; text-decoration: underline; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
            th, td { border: 1px solid #e5e7eb; padding: 0.5rem; text-align: left; }
            th { background: #f9fafb; font-weight: 600; }
          `
        }} />
      </head>
      <body dangerouslySetInnerHTML={{ __html: html }} />
    </html>
  );
}
