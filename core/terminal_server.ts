/**
 * JIT Interactive Web Terminal Server
 * 
 * Bridges browser xterm.js to a real Linux pseudoterminal (node-pty) over WebSocket.
 */

import http from 'http';
import os from 'os';
import pty from 'node-pty';
import { WebSocketServer, WebSocket } from 'ws';

export class TerminalServer {
  private wss: WebSocketServer;

  constructor(server: http.Server, path: string = '/ws/terminal') {
    this.wss = new WebSocketServer({ server, path });
    this.wss.on('error', () => {
      // Ignored: HTTP server error listener handles EADDRINUSE
    });
    this.setup();
  }

  private setup() {
    const defaultShell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('💻 [Web Terminal] 客戶端建立連線，啟動虛擬終端 (PTY)...');

      let ptyProcess: pty.IPty;

      try {
        ptyProcess = pty.spawn(defaultShell, [], {
          name: 'xterm-256color',
          cols: 80,
          rows: 20,
          cwd: process.cwd(),
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
          },
        });
      } catch (err: any) {
        console.error('[Web Terminal] PTY 啟動失敗:', err.message);
        ws.send(JSON.stringify({ type: 'output', data: `\r\n\x1b[31m啟動 Shell 失敗: ${err.message}\x1b[0m\r\n` }));
        ws.close();
        return;
      }

      // Stream output from PTY to client
      ptyProcess.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'output', data }));
        }
      });

      // Handle client input and resize
      ws.on('message', (message: string) => {
        try {
          const msg = JSON.parse(message.toString());
          if (msg.type === 'input' && typeof msg.data === 'string') {
            ptyProcess.write(msg.data);
          } else if (msg.type === 'resize' && msg.cols && msg.rows) {
            ptyProcess.resize(Math.max(10, msg.cols), Math.max(5, msg.rows));
          }
        } catch {
          // If not JSON, treat raw message as direct keystroke input
          ptyProcess.write(message.toString());
        }
      });

      // Cleanup on disconnect
      ws.on('close', () => {
        try {
          ptyProcess.kill();
        } catch {
          // Process might already be exited
        }
      });

      ws.on('error', () => {
        try {
          ptyProcess.kill();
        } catch {}
      });
    });
  }
}
