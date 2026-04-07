
export type LogCategory = 'all' | 'ai' | 'system' | 'error' | 'database';

export type LogEntry = {
  timestamp: string;
  level: 'info' | 'error' | 'warn';
  category: LogCategory;
  message: string;
};

class LoggerService {
  private logs: LogEntry[] = [];
  private listeners: ((logs: LogEntry[]) => void)[] = [];
  constructor() {
    this.interceptConsole();
  }

  // Removed internal init and listen to avoid Tauri context issues outside React

  private interceptConsole() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      originalLog(...args);
      this.addLog('info', args);
    };

    console.error = (...args) => {
      originalError(...args);
      this.addLog('error', args);
    };

    console.warn = (...args) => {
        originalWarn(...args);
        this.addLog('warn', args);
    };
  }

  public addLog(level: 'info' | 'error' | 'warn', args: any[]) {
    const message = args.map(a => {
        if (a instanceof Error) return a.toString();
        if (typeof a === 'object') {
            try {
                return JSON.stringify(a, null, 2);
            } catch(e) {
                return "[Circular Object]";
            }
        }
        return String(a);
    }).join(' ');

    let category: LogCategory = 'system';
    
    if (level === 'error') {
        category = 'error';
    } else if (message.includes('[AI]') || message.includes('AI REQ:')) {
        category = 'ai';
    } else if (message.includes('DB:') || message.includes('SQL:')) {
        category = 'database';
    } else if (message.includes('APP:') || message.includes('CMD:')) {
        category = 'system';
    }
    
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      category,
      message
    };
    
    this.logs.push(entry);
    if (this.logs.length > 2000) this.logs.shift(); // Limit history
    
    this.notify();
  }

  subscribe(cb: (logs: LogEntry[]) => void) {
    this.listeners.push(cb);
    cb(this.logs);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.logs));
  }
  
  clear() {
      this.logs = [];
      this.notify();
  }
}

export const logger = new LoggerService();
