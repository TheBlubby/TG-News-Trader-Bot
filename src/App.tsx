import React, { useState, useEffect } from 'react';
import { Settings, Activity, TerminalSquare, Save, Play, Square, AlertCircle, CheckCircle2, Zap } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'settings' | 'strategy' | 'logs'>('settings');
  const [settings, setSettings] = useState({
    mexcApiKey: "",
    mexcApiSecret: "",
    telegramTargetChannel: "",
    positionSizeQuote: "50",
    leverage: "10",
    takeProfitPrc: "15",
    stopLossPrc: "5",
    keywords: [] as string[],
    isRunning: false
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Load settings on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => setSettings(data))
      .catch(err => console.error("Could not fetch settings", err));
  }, []);

  // Poll logs
  useEffect(() => {
    if (activeTab === 'logs') {
      const fetchLogs = () => {
        fetch('/api/logs')
          .then(res => res.json())
          .then(data => setLogs(data))
          .catch(err => console.error("Could not fetch logs", err));
      };
      fetchLogs();
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      setSettings(data.settings);
      // alert("Settings saved!"); // Avoided alert to stay iframe-safe
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBot = async () => {
    try {
      const res = await fetch('/api/toggle', { method: 'POST' });
      const data = await res.json();
      setSettings(prev => ({ ...prev, isRunning: data.isRunning }));
    } catch (e) {
      console.error(e);
    }
  };

  const executeTestBuy = async () => {
    if(confirm("This will trigger the MEXC trade logic immediately. Are you sure?")) {
      await fetch('/api/test-buy', { method: 'POST' });
      setActiveTab('logs');
    }
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !settings.keywords.includes(newKeyword.trim())) {
      setSettings(prev => ({
        ...prev,
        keywords: [...prev.keywords, newKeyword.trim()]
      }));
      setNewKeyword("");
    }
  };

  const removeKeyword = (kw: string) => {
    setSettings(prev => ({
      ...prev,
      keywords: prev.keywords.filter(k => k !== kw)
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
            <Activity size={18} />
          </div>
          <span className="font-semibold text-lg tracking-tight">TG Trader</span>
        </div>
        
        <nav className="p-4 flex-1 space-y-1">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${activeTab === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <Settings size={18} />
            <span className="font-medium text-sm">API & Setup</span>
          </button>
          <button 
            onClick={() => setActiveTab('strategy')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${activeTab === 'strategy' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <Activity size={18} />
            <span className="font-medium text-sm">Strategy</span>
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${activeTab === 'logs' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <TerminalSquare size={18} />
            <span className="font-medium text-sm">System Logs</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">System Status</p>
            <div className="flex items-center gap-2">
              <span className={`relative flex h-3 w-3`}>
                {settings.isRunning && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${settings.isRunning ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
              </span>
              <span className={`text-sm font-medium ${settings.isRunning ? 'text-emerald-700' : 'text-rose-700'}`}>
                {settings.isRunning ? 'Listening for News' : 'Offline'}
              </span>
            </div>
            
            <button 
              onClick={handleToggleBot}
              className={`mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-md font-medium text-sm transition-colors ${
                settings.isRunning 
                  ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' 
                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              }`}
            >
              {settings.isRunning ? <Square size={16} /> : <Play size={16} />}
              {settings.isRunning ? 'Stop Bot' : 'Start Bot'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 max-w-4xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {activeTab === 'settings' && 'Platform Integration'}
            {activeTab === 'strategy' && 'Trading Strategy'}
            {activeTab === 'logs' && 'Real-time Logs'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {activeTab === 'settings' && 'Configure your MEXC standard API keys and Telegram credentials.'}
            {activeTab === 'strategy' && 'Define keywords, leverage, and position sizing for the TON/USDT pair.'}
            {activeTab === 'logs' && 'Monitor incoming signals and executing trades.'}
          </p>
        </header>

        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Settings size={20} className="text-slate-400"/> MEXC Futures API</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                  <input type="password" value={settings.mexcApiKey} onChange={e => setSettings({...settings, mexcApiKey: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="mexc_api_key..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">API Secret</label>
                  <input type="password" value={settings.mexcApiSecret} onChange={e => setSettings({...settings, mexcApiSecret: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="mexc_api_secret..." />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Activity size={20} className="text-slate-400"/> Telegram Webhook Setup (Vercel)</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 flex gap-3 text-amber-800 text-sm">
                <AlertCircle size={20} className="text-amber-600 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">Webhook URL Required for Vercel</p>
                  <p>In a serverless Vercel environment, you must use a Telegram Bot. Register a bot with @BotFather and set its webhook to point to <code>https://your-vercel-app.vercel.app/api/webhook/telegram</code>.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Target Channel ID (to monitor)</label>
                  <input type="text" value={settings.telegramTargetChannel} onChange={e => setSettings({...settings, telegramTargetChannel: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="-1001234567890" />
                  <p className="text-xs text-slate-500 mt-1">The bot must be added to this channel as an admin to receive messages via webhooks.</p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <button disabled={isSaving} onClick={handleSave} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-md font-medium text-sm transition-colors shadow-sm disabled:opacity-75">
                <Save size={16} /> {isSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'strategy' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                 <h2 className="text-lg font-medium">Trading Parameters: TON/USDT LONG</h2>
                 <button onClick={executeTestBuy} className="flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-md transition-colors">
                   <Zap size={14} /> Test Order
                 </button>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Position Size (USDT Margin)</label>
                  <input type="number" value={settings.positionSizeQuote} onChange={e => setSettings({...settings, positionSizeQuote: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  <p className="text-xs text-slate-500 mt-1">Amount of your margin to risk per trade.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Leverage (x)</label>
                  <select value={settings.leverage} onChange={e => setSettings({...settings, leverage: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
                    <option value="5">5x</option>
                    <option value="10">10x</option>
                    <option value="20">20x</option>
                    <option value="50">50x</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Take Profit (%)</label>
                  <input type="number" value={settings.takeProfitPrc} onChange={e => setSettings({...settings, takeProfitPrc: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stop Loss (%)</label>
                  <input type="number" value={settings.stopLossPrc} onChange={e => setSettings({...settings, stopLossPrc: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-medium mb-4">Trigger Keywords for Long Position</h2>
              <p className="text-sm text-slate-500 mb-4">The bot will instantly open a LONG position if a matched post contains ANY of these terms.</p>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {settings.keywords.map(word => (
                  <span key={word} className="px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-sm flex items-center gap-1">
                    {word}
                    <button onClick={() => removeKeyword(word)} className="text-slate-400 hover:text-slate-600 ml-1">&times;</button>
                  </span>
                ))}
                {settings.keywords.length === 0 && <span className="text-sm text-slate-400 italic">No keywords defined.</span>}
              </div>
              <div className="flex gap-2 max-w-sm">
                <input 
                  type="text" 
                  value={newKeyword}
                  onChange={e => setNewKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addKeyword()}
                  placeholder="Add keyword..." 
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
                <button onClick={addKeyword} className="bg-slate-900 text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-slate-800 transition-colors">Add</button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button disabled={isSaving} onClick={handleSave} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-md font-medium text-sm transition-colors shadow-sm disabled:opacity-75">
                <Save size={16} /> {isSaving ? 'Saving...' : 'Save Strategy'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="bg-slate-900 rounded-xl p-4 font-mono text-sm shadow-inner h-[600px] overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col">
            <div className="space-y-3 flex-1 flex flex-col">
              {logs.length === 0 && <div className="text-slate-500 italic">No logs yet...</div>}
              {logs.map((log, i) => (
                <div key={i} className={`
                  ${log.includes('KEYWORD MATCH') ? 'text-emerald-400 font-semibold' : ''}
                  ${log.includes('ORDER FILLED') ? 'text-emerald-300 bg-emerald-900/30 px-2 py-1 rounded' : ''}
                  ${log.includes('Sending Market Buy') ? 'text-blue-400' : ''}
                  ${log.includes('ERROR') ? 'text-rose-400' : 'text-slate-300'}
                `}>
                  {log}
                </div>
              ))}
              
              {settings.isRunning && (
                <div className="flex items-center gap-2 text-slate-500 mt-6 pt-4 border-t border-slate-800">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  Listening for specific webhook triggers...
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
