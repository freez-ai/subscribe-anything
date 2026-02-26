import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LLMProviderList from '@/components/settings/LLMProviderList';
import PromptTemplateEditor from '@/components/settings/PromptTemplateEditor';
import SearchProviderForm from '@/components/settings/SearchProviderForm';
import RssInstanceList from '@/components/settings/RssInstanceList';

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">配置</h1>
      <Tabs defaultValue="llm">
        <TabsList className="w-full overflow-x-auto flex">
          <TabsTrigger value="llm">AI 供应商</TabsTrigger>
          <TabsTrigger value="prompts">提示词模板</TabsTrigger>
          <TabsTrigger value="search">搜索供应商</TabsTrigger>
          <TabsTrigger value="rss">RSS 供应商</TabsTrigger>
        </TabsList>
        <TabsContent value="llm">
          <LLMProviderList />
        </TabsContent>
        <TabsContent value="prompts">
          <PromptTemplateEditor />
        </TabsContent>
        <TabsContent value="search">
          <SearchProviderForm />
        </TabsContent>
        <TabsContent value="rss">
          <RssInstanceList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
