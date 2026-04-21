'use client';

import React, { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { 
  Plus, 
  Settings, 
  Activity, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Globe, 
  Key, 
  Cpu, 
  RefreshCw 
} from 'lucide-react';
import { clsx } from 'clsx';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ProviderConfig {
  id: string;
  name: string;
  provider_type: string;
  base_url?: string;
  api_key?: string;
  is_enabled: number;
  is_default: number;
  updated_at: string;
}

export default function ProvidersPage() {
  const { data: providers, error } = useSWR<ProviderConfig[]>('/api/platform/providers', fetcher);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState<Partial<ProviderConfig>>({
    name: '',
    provider_type: 'openai',
    base_url: '',
    api_key: '',
    is_enabled: 1,
    is_default: 0
  });

  const handleSave = async () => {
    await fetch('/api/platform/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    mutate('/api/platform/providers');
    setIsModalOpen(false);
    setForm({ name: '', provider_type: 'openai', base_url: '', api_key: '', is_enabled: 1, is_default: 0 });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;
    await fetch(`/api/platform/providers/${id}`, { method: 'DELETE' });
    mutate('/api/platform/providers');
  };

  const testConnection = async (id: string) => {
    setIsTesting(id);
    try {
      const res = await fetch(`/api/platform/providers/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult(prev => ({ ...prev, [id]: data.ok }));
    } catch {
      setTestResult(prev => ({ ...prev, [id]: false }));
    } finally {
      setIsTesting(null);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-[#0a0a0b] text-white">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
              Model Providers
            </h1>
            <p className="text-gray-400 mt-2 text-lg">Infrastructure Registry for Multi-LLM Orchestration</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 rounded-full font-medium transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-95"
          >
            <Plus size={20} />
            Add Provider
          </button>
        </header>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-8 flex items-center gap-3 text-red-400">
            <AlertCircle size={20} />
            <span>Failed to load providers registry. Ensure API server is running.</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers?.map((provider) => (
            <div 
              key={provider.id}
              className="bg-[#121214] border border-white/5 p-6 rounded-2xl group hover:border-indigo-500/40 transition-all duration-300 shadow-xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div className={clsx(
                  "p-3 rounded-xl",
                  provider.provider_type === 'ollama' ? "bg-amber-500/10 text-amber-400" : 
                  provider.provider_type === 'anthropic' ? "bg-purple-500/10 text-purple-400" :
                  "bg-blue-500/10 text-blue-400"
                )}>
                  <Cpu size={24} />
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => { setForm(provider); setIsModalOpen(true); }}
                    className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                  >
                    <Settings size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(provider.id)}
                    className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <h3 className="text-xl font-semibold mb-1">{provider.name}</h3>
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-6">
                <span className="uppercase tracking-widest text-[10px] bg-white/5 px-2 py-0.5 rounded border border-white/5 font-bold">
                  {provider.provider_type}
                </span>
                {provider.is_default === 1 && (
                  <span className="text-indigo-400 font-medium">Default</span>
                )}
              </div>

              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <Globe size={14} className="shrink-0" />
                  <span className="truncate">{provider.base_url || 'Standard Cloud API'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <Key size={14} className="shrink-0" />
                  <span>{provider.api_key ? '••••••••••••••••' : 'No key provided'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <div className={clsx(
                    "w-2 h-2 rounded-full",
                    provider.is_enabled === 1 ? "bg-emerald-500" : "bg-gray-700"
                  )} />
                  <span className="text-xs text-gray-500 font-medium">
                    {provider.is_enabled === 1 ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <button 
                  onClick={() => testConnection(provider.id)}
                  disabled={isTesting === provider.id}
                  className={clsx(
                    "flex items-center gap-2 text-[11px] font-bold uppercase transition-all px-3 py-1 rounded-full border",
                    isTesting === provider.id ? "bg-white/5 text-gray-400 border-transparent animate-pulse" :
                    testResult[provider.id] === true ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                    testResult[provider.id] === false ? "bg-red-500/10 text-red-400 border-red-500/20" :
                    "bg-white/5 text-gray-400 border-white/10 hover:border-white/20"
                  )}
                >
                  <RefreshCw size={12} className={clsx(isTesting === provider.id && "animate-spin")} />
                  {isTesting === provider.id ? 'Testing...' : 
                   testResult[provider.id] === true ? 'Verified' : 
                   testResult[provider.id] === false ? 'Failed' : 'Test Heartbeat'}
                </button>
              </div>
            </div>
          ))}

          {providers?.length === 0 && (
            <div className="col-span-full py-24 border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-gray-500">
              <Plus size={48} className="mb-4 opacity-20" />
              <p className="text-xl font-medium">No providers configured</p>
              <p className="mt-2 text-gray-600">Add your first model provider to begin orchestration.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Backdrop */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#121214] border border-white/10 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-8 border-b border-white/5 bg-gradient-to-r from-indigo-500/5 to-transparent">
              <h2 className="text-2xl font-bold">Configure Model Provider</h2>
              <p className="text-gray-400 mt-1">Define your infrastructure and access credentials</p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Display Name</label>
                  <input 
                    type="text" 
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="e.g. Local Llama 3"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Backend Type</label>
                  <select 
                    value={form.provider_type}
                    onChange={(e) => setForm({ ...form, provider_type: e.target.value as any })}
                    className="w-full bg-[#1c1c1f] border border-white/10 rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="ollama">Ollama (Local)</option>
                    <option value="groq">Groq</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="lmstudio">LMStudio</option>
                    <option value="custom">Generic OpenAI-Compatible</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Base URL / Endpoint</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input 
                    type="text" 
                    value={form.base_url}
                    onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-2.5 focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder={form.provider_type === 'ollama' ? "http://localhost:11434" : "https://api.example.com/v1"}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">API Secret Key</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input 
                    type="password" 
                    value={form.api_key}
                    onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-2.5 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-gray-700"
                    placeholder={form.provider_type === 'ollama' ? "Not required for local" : "sk-..."}
                  />
                </div>
                <p className="mt-2 text-[10px] text-gray-600 flex items-center gap-1.5 uppercase font-bold tracking-tighter">
                  <AlertCircle size={10} />
                  Saved locally in autoorg.db. Sensitive keys should be handled with care.
                </p>
              </div>

              <div className="flex items-center gap-8 pt-4">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      checked={form.is_enabled === 1}
                      onChange={(e) => setForm({ ...form, is_enabled: e.target.checked ? 1 : 0 })}
                      className="peer sr-only"
                    />
                    <div className="w-10 h-5 bg-white/5 border border-white/10 rounded-full transition-colors peer-checked:bg-indigo-600"></div>
                    <div className="absolute left-1 top-1 w-3 h-3 bg-gray-400 rounded-full transition-all peer-checked:left-6 peer-checked:bg-white"></div>
                  </div>
                  <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">Active</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      checked={form.is_default === 1}
                      onChange={(e) => setForm({ ...form, is_default: e.target.checked ? 1 : 0 })}
                      className="peer sr-only"
                    />
                    <div className="w-10 h-5 bg-white/5 border border-white/10 rounded-full transition-colors peer-checked:bg-indigo-600"></div>
                    <div className="absolute left-1 top-1 w-3 h-3 bg-gray-400 rounded-full transition-all peer-checked:left-6 peer-checked:bg-white"></div>
                  </div>
                  <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">Default Provider</span>
                </label>
              </div>
            </div>

            <div className="p-8 bg-white/[0.02] border-t border-white/5 flex justify-end gap-4">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2 rounded-xl font-medium text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="bg-indigo-600 hover:bg-indigo-500 px-8 py-2 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/10 active:scale-95"
              >
                Persist Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
