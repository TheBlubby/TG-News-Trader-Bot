import React, { useState, useEffect, useRef } from 'react';
import { Settings, Activity, TerminalSquare, Save, Play, Square, AlertCircle, CheckCircle2, Zap, Sun, Moon, Monitor } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

const getLogStyle = (log: string) => {
  if (log.includes('KEYWORD MATCH') || log.includes('🟢')) {
    return 'text-emerald-500 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-950/40 px-3 py-2 rounded-md border border-emerald-200 dark:border-emerald-800 shadow-sm';
  }
  if (log.includes('FATAL ERROR') || log.includes('❌') || log.includes('ERROR:') || log.includes('API ERROR')) {
    return 'text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/20 px-3 py-1.5 rounded border-l-2 border-rose-400 dark:border-rose-500';
  }
  if (log.includes('✅') || log.includes('ORDER FILLED') || log.includes('LIVE Trade Executed')) {
    return 'text-emerald-600 dark:text-emerald-300 font-medium bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 rounded border-l-2 border-emerald-400 dark:border-emerald-500';
  }
  if (log.includes('⚡')) {
    return 'text-amber-600 dark:text-amber-300 font-medium bg-amber-50 dark:bg-amber-950/20 px-3 py-1.5 rounded border-l-2 border-amber-400 dark:border-amber-500';
  }
  if (log.includes('Sending Market')) {
    return 'text-blue-600 dark:text-cyan-400 font-medium px-3 py-1';
  }
  if (log.includes('Calculated quantity') || log.includes('Ear listening on socket')) {
    return 'text-slate-500 dark:text-slate-400 px-3 py-1 italic';
  }
  return 'text-slate-700 dark:text-slate-300 px-3 py-1';
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'telegram' | 'mexc' | 'strategy' | 'logs'>('telegram');
  const [theme, setTheme] = useState<Theme>('system');
  const [settings, setSettings] = useState({
    telegramTargetChannel: "",
    tgApiId: "",
    tgApiHash: "",
    tgSessionString: "",
    telegramBotToken: "",
    telegramChatId: "",
    positionSizeQuote: "50",
    leverage: "10",
    marginMode: "cross",
    enableTakeProfit: true,
    takeProfitPrc: "15",
    enableStopLoss: true,
    stopLossPrc: "5",
    keywords: [] as string[],
    isRunning: false,
    mexcAccounts: [] as any[]
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const applyTheme = () => {
      const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    if (theme === 'system') {
      const matcher = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      matcher.addEventListener('change', listener);
      return () => matcher.removeEventListener('change', listener);
    }
  }, [theme]);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (!data.mexcAccounts) {
          data.mexcAccounts = [];
        }
        setSettings(data);
      })
      .catch(err => console.error("Could not fetch settings", err));
  }, []);

  // Poll for isRunning status to keep the UI in sync (e.g., when bot auto-stops after a trade)
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          setSettings(prev => prev.isRunning !== data.isRunning ? { ...prev, isRunning: data.isRunning } : prev);
        })
        .catch(() => {
          // Ignore status poll errors. Typically happens when server is restarting.
        });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Poll logs
  useEffect(() => {
    if (activeTab === 'logs') {
      const fetchLogs = () => {
        fetch('/api/logs')
          .then(res => res.json())
          .then(data => setLogs(data))
          .catch(() => {
            // Ignore fetch errors during restarts
          });
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex font-sans text-slate-900 dark:text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
            <Activity size={18} />
          </div>
          <span className="font-semibold text-lg tracking-tight">TG Trader</span>
        </div>
        
        <nav className="p-4 flex-1 space-y-1">
          <button 
            onClick={() => setActiveTab('telegram')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${activeTab === 'telegram' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'}`}
          >
            <Activity size={18} />
            <span className="font-medium text-sm">Telegram MTProto</span>
          </button>
          <button 
            onClick={() => setActiveTab('mexc')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${activeTab === 'mexc' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'}`}
          >
            <Settings size={18} />
            <span className="font-medium text-sm">MEXC Account</span>
          </button>
          <button 
            onClick={() => setActiveTab('strategy')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${activeTab === 'strategy' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'}`}
          >
            <Zap size={18} />
            <span className="font-medium text-sm">Strategy Parameters</span>
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${activeTab === 'logs' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'}`}
          >
            <TerminalSquare size={18} />
            <span className="font-medium text-sm">System Logs</span>
          </button>
        </nav>

        <div className="px-4 py-3 mx-4 mb-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg flex justify-between items-center text-slate-500 dark:text-slate-400">
            <button onClick={() => setTheme('light')} className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}><Sun size={16} /></button>
            <button onClick={() => setTheme('system')} className={`p-1.5 rounded-md transition-colors ${theme === 'system' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}><Monitor size={16} /></button>
            <button onClick={() => setTheme('dark')} className={`p-1.5 rounded-md transition-colors ${theme === 'dark' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}><Moon size={16} /></button>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="bg-slate-100 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
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
                  ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900/50' 
                  : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
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
            {activeTab === 'telegram' && 'Telegram Integration'}
            {activeTab === 'mexc' && 'MEXC Account Sync'}
            {activeTab === 'strategy' && 'Trading Strategy'}
            {activeTab === 'logs' && 'Real-time Logs'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {activeTab === 'telegram' && 'Configure Telegram MTProto to listen for signals with ~0ms delay.'}
            {activeTab === 'mexc' && 'Link your MEXC Futures account.'}
            {activeTab === 'strategy' && 'Define keywords, leverage, and position sizing for the TON/USDT pair.'}
            {activeTab === 'logs' && 'Monitor incoming signals and executing trades.'}
          </p>
        </header>

        {activeTab === 'telegram' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Activity size={20} className="text-slate-400"/> Telegram MTProto Settings</h2>
              
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-lg p-4 mb-4 flex gap-3 text-blue-800 dark:text-blue-300 text-sm">
                <div className="space-y-1">
                  <p className="font-semibold">Local Fast Listening Enabled</p>
                  <p>To use this locally with 0ms delay, run <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">npm run generate-session</code> in your terminal to generate your String Session.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Channel Username (e.g. durov)</label>
                  <input type="text" value={settings.telegramTargetChannel} onChange={e => setSettings({...settings, telegramTargetChannel: e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="durov" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Telegram API ID</label>
                  <input type="text" value={settings.tgApiId} onChange={e => setSettings({...settings, tgApiId: e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="1234567" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Telegram API Hash</label>
                  <input type="password" value={settings.tgApiHash} onChange={e => setSettings({...settings, tgApiHash: e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">String Session</label>
                  <input type="password" value={settings.tgSessionString} onChange={e => setSettings({...settings, tgSessionString: e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="Paste generated session string here..." />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2">Telegram Bot Notifications</h2>
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-lg p-4 mb-4 text-sm text-blue-800 dark:text-blue-300">
                <strong>Important:</strong> The bot can only send you messages if you have started a conversation with it first! Send <strong>/start</strong> to your bot in Telegram before testing.
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Telegram Bot Token</label>
                  <input type="password" value={settings.telegramBotToken} onChange={e => setSettings({...settings, telegramBotToken: e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Your Chat ID (можно через запятую)</label>
                  <input type="text" value={settings.telegramChatId} onChange={e => setSettings({...settings, telegramChatId: e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="-100123..., 12345..." />
                </div>
                <div className="pt-2">
                  <button onClick={() => {
                    fetch('/api/test-notification', { method: 'POST' });
                  }} className="text-sm bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2 rounded transition-colors">
                    Test Notification Message
                  </button>
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

        {activeTab === 'mexc' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Configured MEXC Accounts</h2>
              <button 
                onClick={() => {
                  setSettings({
                    ...settings,
                    mexcAccounts: [
                      ...settings.mexcAccounts,
                      {
                        id: Math.random().toString(36).substr(2, 9),
                        name: `Account ${settings.mexcAccounts.length + 1}`,
                        apiKey: "",
                        apiSecret: "",
                        useGlobalStrategy: true,
                        positionSizeQuote: "50", 
                        leverage: "10",
                        marginMode: "cross",
                        enableTakeProfit: true,
                        takeProfitPrc: "15",
                        enableStopLoss: true,
                        stopLossPrc: "5",
                      }
                    ]
                  })
                }}
                className="text-white bg-slate-800 hover:bg-slate-900 px-3 py-1.5 rounded-md text-sm font-medium"
              >
                + Add Account
              </button>
            </div>

            {settings.mexcAccounts.map((account, index) => (
              <div key={account.id} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
                <button 
                  onClick={() => {
                    const newAccounts = [...settings.mexcAccounts];
                    newAccounts.splice(index, 1);
                    setSettings({...settings, mexcAccounts: newAccounts});
                  }}
                  className="absolute top-4 right-4 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400"
                >
                  <Square size={16} />
                </button>
                <h3 className="font-semibold mb-4 text-slate-800 dark:text-slate-100">{account.name}</h3>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Account Display Name</label>
                    <input type="text" value={account.name} onChange={e => {
                      const newAccounts = [...settings.mexcAccounts];
                      newAccounts[index].name = e.target.value;
                      setSettings({...settings, mexcAccounts: newAccounts});
                    }} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" placeholder="e.g. Test Acc" />
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">API Key</label>
                    <input type="password" value={account.apiKey} onChange={e => {
                      const newAccounts = [...settings.mexcAccounts];
                      newAccounts[index].apiKey = e.target.value;
                      setSettings({...settings, mexcAccounts: newAccounts});
                    }} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="mexc_api_key..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">API Secret</label>
                    <input type="password" value={account.apiSecret} onChange={e => {
                      const newAccounts = [...settings.mexcAccounts];
                      newAccounts[index].apiSecret = e.target.value;
                      setSettings({...settings, mexcAccounts: newAccounts});
                    }} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="mexc_api_secret..." />
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                  <label className="flex items-center gap-2 mb-4">
                    <input type="checkbox" checked={account.useGlobalStrategy} onChange={e => {
                      const newAccounts = [...settings.mexcAccounts];
                      newAccounts[index].useGlobalStrategy = e.target.checked;
                      setSettings({...settings, mexcAccounts: newAccounts});
                    }} className="rounded bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500/50" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Use Global Strategy Parameters</span>
                  </label>

                  {!account.useGlobalStrategy && (
                    <div className="bg-slate-50 dark:bg-slate-950/50 p-4 rounded-md border border-slate-200 dark:border-slate-800 space-y-4 relative">
                       <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">Override Trade Settings</h4>
                       
                       <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Margin Size (USDT)</label>
                          <input type="number" value={account.positionSizeQuote} onChange={e => {
                            const newAccounts = [...settings.mexcAccounts];
                            newAccounts[index].positionSizeQuote = e.target.value;
                            setSettings({...settings, mexcAccounts: newAccounts});
                          }} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Leverage (x)</label>
                          <input type="number" value={account.leverage} onChange={e => {
                            const newAccounts = [...settings.mexcAccounts];
                            newAccounts[index].leverage = e.target.value;
                            setSettings({...settings, mexcAccounts: newAccounts});
                          }} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                        </div>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Margin Mode</label>
                           <select value={account.marginMode} onChange={e => {
                             const newAccounts = [...settings.mexcAccounts];
                             newAccounts[index].marginMode = e.target.value;
                             setSettings({...settings, mexcAccounts: newAccounts});
                           }} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
                             <option value="cross">Cross</option>
                             <option value="isolated">Isolated</option>
                           </select>
                        </div>
                       </div>

                      <div className="space-y-4">
                        <div className="bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
                          <label className="flex items-center gap-2 mb-2 cursor-pointer">
                            <input type="checkbox" checked={account.enableTakeProfit} onChange={e => {
                              const newAccounts = [...settings.mexcAccounts];
                              newAccounts[index].enableTakeProfit = e.target.checked;
                              setSettings({...settings, mexcAccounts: newAccounts});
                            }} className="rounded bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500/50" />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Take Profit (%)</span>
                          </label>
                          {account.enableTakeProfit && (
                            <input type="number" value={account.takeProfitPrc} onChange={e => {
                              const newAccounts = [...settings.mexcAccounts];
                              newAccounts[index].takeProfitPrc = e.target.value;
                              setSettings({...settings, mexcAccounts: newAccounts});
                            }} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                          )}
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
                          <label className="flex items-center gap-2 mb-2 cursor-pointer">
                            <input type="checkbox" checked={account.enableStopLoss} onChange={e => {
                              const newAccounts = [...settings.mexcAccounts];
                              newAccounts[index].enableStopLoss = e.target.checked;
                              setSettings({...settings, mexcAccounts: newAccounts});
                            }} className="rounded bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500/50" />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Stop Loss (%)</span>
                          </label>
                          {account.enableStopLoss && (
                            <input type="number" value={account.stopLossPrc} onChange={e => {
                              const newAccounts = [...settings.mexcAccounts];
                              newAccounts[index].stopLossPrc = e.target.value;
                              setSettings({...settings, mexcAccounts: newAccounts});
                            }} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                          )}
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Telegram Chat ID для этого аккаунта (опционально, можно через запятую)</label>
                        <input type="text" value={account.telegramChatId || ""} onChange={e => {
                          const newAccounts = [...settings.mexcAccounts];
                          newAccounts[index].telegramChatId = e.target.value;
                          setSettings({...settings, mexcAccounts: newAccounts});
                        }} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" placeholder="-100123... (Только для уведомлений по сделкам этого аккаунта)" />
                      </div>

                    </div>
                  )}
                </div>
              </div>
            ))}
            
            <div className="flex justify-end pt-2">
              <button disabled={isSaving} onClick={handleSave} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-md font-medium text-sm transition-colors shadow-sm disabled:opacity-75">
                <Save size={16} /> {isSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'strategy' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                 <h2 className="text-lg font-medium">Trading Parameters: TON/USDT LONG</h2>
                 <div className="flex items-center gap-4">
                   <button onClick={executeTestBuy} className="flex items-center gap-1 text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 px-3 py-1.5 rounded-md transition-colors">
                     <Zap size={14} /> Test Order
                   </button>
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Position Size (USDT Margin)</label>
                  <input type="number" value={settings.positionSizeQuote} onChange={e => setSettings({...settings, positionSizeQuote: e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Amount of your margin to risk per trade.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Leverage (x)</label>
                  <select value={settings.leverage} onChange={e => setSettings({...settings, leverage: e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="5">5x</option>
                    <option value="10">10x</option>
                    <option value="20">20x</option>
                    <option value="50">50x</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Margin Mode</label>
                  <select value={settings.marginMode} onChange={e => setSettings({...settings, marginMode: e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="cross">Cross</option>
                    <option value="isolated">Isolated</option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 cursor-pointer">
                    <input type="checkbox" checked={settings.enableTakeProfit} onChange={e => setSettings({...settings, enableTakeProfit: e.target.checked})} className="w-4 h-4 text-blue-600 bg-white dark:bg-slate-950 border-gray-300 dark:border-slate-700 rounded focus:ring-blue-500" />
                    Take Profit (%)
                  </label>
                  <input type="number" disabled={!settings.enableTakeProfit} value={settings.takeProfitPrc} onChange={e => setSettings({...settings, takeProfitPrc: e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 cursor-pointer">
                    <input type="checkbox" checked={settings.enableStopLoss} onChange={e => setSettings({...settings, enableStopLoss: e.target.checked})} className="w-4 h-4 text-blue-600 bg-white dark:bg-slate-950 border-gray-300 dark:border-slate-700 rounded focus:ring-blue-500" />
                    Stop Loss (%)
                  </label>
                  <input type="number" disabled={!settings.enableStopLoss} value={settings.stopLossPrc} onChange={e => setSettings({...settings, stopLossPrc: e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h2 className="text-lg font-medium mb-4">Trigger Keywords for Long Position</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">The bot will instantly open a LONG position if a matched post contains ANY of these terms.</p>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {settings.keywords.map(word => (
                  <span key={word} className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-full text-sm flex items-center gap-1">
                    {word}
                    <button onClick={() => removeKeyword(word)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 ml-1">&times;</button>
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
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
                <button onClick={addKeyword} className="bg-slate-900 dark:bg-slate-700 text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors">Add</button>
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
          <div className="bg-slate-950 rounded-xl p-4 font-mono text-sm shadow-inner h-[600px] overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col border border-slate-800">
            <div className="space-y-2 flex-1 flex flex-col">
              {logs.length === 0 && <div className="text-slate-500 italic px-3">No logs yet...</div>}
              {logs.map((log, i) => (
                <div key={i} className={`transition-all duration-300 ease-in-out break-words ${getLogStyle(log)}`}>
                  {log}
                </div>
              ))}
              
              {settings.isRunning && (
                <div className="flex items-center gap-2 text-slate-500 mt-6 pt-4 border-t border-slate-800/50 px-3">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                  Listening for real-time MTProto triggers...
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
