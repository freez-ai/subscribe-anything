'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { WizardState } from '@/types/wizard';

interface Step1TopicProps {
  state: WizardState;
  onStateChange: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step1Topic({ state, onStateChange, onNext }: Step1TopicProps) {
  const [topic, setTopic] = useState(state.topic);
  const [criteria, setCriteria] = useState(state.criteria);
  const [topicError, setTopicError] = useState('');

  const handleSubmit = () => {
    const trimmed = topic.trim();
    if (!trimmed) {
      setTopicError('请输入订阅主题');
      return;
    }
    setTopicError('');
    onStateChange({ topic: trimmed, criteria: criteria.trim() });
    onNext();
  };

  return (
    <div className="flex flex-col gap-6 pt-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">设置订阅主题</h2>
        <p className="text-sm text-muted-foreground">
          告诉我们你想订阅什么内容，AI 将自动为你发现相关数据源
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="topic" className="text-sm font-medium">
            订阅主题 <span className="text-destructive">*</span>
          </label>
          <Input
            id="topic"
            placeholder="例如：GitHub 热门开源项目"
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              if (e.target.value.trim()) setTopicError('');
            }}
            className={topicError ? 'border-destructive focus-visible:ring-destructive' : ''}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
          />
          {topicError && (
            <p className="text-xs text-destructive">{topicError}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="criteria" className="text-sm font-medium">
            监控条件{' '}
            <span className="text-muted-foreground font-normal">（可选）</span>
          </label>
          <Textarea
            id="criteria"
            placeholder="例如：Star 数超过 1000，最近一周更新"
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            描述你感兴趣的内容筛选条件，让 AI 更精准地帮你筛选
          </p>
        </div>
      </div>

      {/* Mobile: fixed bottom; Desktop: inline */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t md:static md:border-t-0 md:bg-transparent md:p-0 md:mt-6">
        <Button onClick={handleSubmit} className="w-full md:w-auto">
          下一步
        </Button>
      </div>
    </div>
  );
}
