import net, { type Socket } from 'node:net';
import tls, { type TLSSocket } from 'node:tls';
import { randomUUID } from 'node:crypto';
import type { MailMessage, MailTransport } from '../application/ports';
import { NotificationTransportError } from '../application/ports';
export interface SmtpConfiguration { readonly host: string; readonly port: number; readonly username?: string; readonly password?: string; readonly tlsMode: 'implicit' | 'starttls' | 'plain'; readonly timeoutMs: number }
function encoded(value: string) { return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`; }
function validateAddress(value: string) { if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) || /[\r\n]/.test(value)) throw new NotificationTransportError('INVALID_RECIPIENT'); }
function b64Lines(value: string) { return Buffer.from(value.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? ''; }
class SmtpSession {
  private buffer = ''; private waiting: ((value: string) => void) | null = null; private fail: ((error: Error) => void) | null = null;
  constructor(private socket: Socket | TLSSocket, private readonly timeoutMs: number) { this.attach(socket); }
  private attach(socket: Socket | TLSSocket) {
    socket.setEncoding('utf8'); socket.on('data', chunk => { this.buffer += chunk; if (/(?:^|\r\n)\d{3} [^\r\n]*\r\n$/.test(this.buffer) && this.waiting) { const resolve = this.waiting; this.waiting = null; this.fail = null; resolve(this.buffer); this.buffer = ''; } });
    socket.on('error', error => this.fail?.(error)); socket.resume();
  }
  response(): Promise<string> {
    if (/(?:^|\r\n)\d{3} [^\r\n]*\r\n$/.test(this.buffer)) { const result = this.buffer; this.buffer = ''; return Promise.resolve(result); }
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.waiting = null; this.fail = null; reject(new NotificationTransportError('SMTP_TEMPORARY')); }, this.timeoutMs);
      this.waiting = value => { clearTimeout(timer); resolve(value); }; this.fail = () => { clearTimeout(timer); this.waiting = null; reject(new NotificationTransportError('SMTP_TEMPORARY')); }; });
  }
  async command(value: string) { this.socket.write(`${value}\r\n`); const raw = await this.response(); const code = Number(raw.slice(0, 3));
    const expected = value.startsWith('AUTH ') ? 235 : value === 'STARTTLS' ? 220 : value === 'DATA' ? 354 : value === 'QUIT' ? 221 : 250;
    if (code !== expected) throw new NotificationTransportError(code >= 500 ? 'SMTP_PERMANENT' : code >= 400 ? 'SMTP_TEMPORARY' : 'SMTP_PERMANENT');
    return { code, text: raw }; }
  async sendData(value: string) { this.socket.write(`${value.replace(/\r?\n/g, '\r\n').replace(/\r\n\./g, '\r\n..')}\r\n.\r\n`); return this.response(); }
  async upgrade(host: string) {
    const old = this.socket; old.pause(); old.removeAllListeners('data'); old.removeAllListeners('error');
    try {
      this.socket = await new Promise<TLSSocket>((resolve, reject) => { const secure = tls.connect({ socket: old, servername: host, minVersion: 'TLSv1.2' });
        secure.setTimeout(this.timeoutMs, () => secure.destroy(new Error('TIMEOUT'))); secure.once('secureConnect', () => { secure.setTimeout(0); resolve(secure); }); secure.once('error', reject); });
    } catch { throw new NotificationTransportError('CONFIGURATION'); }
    this.buffer = ''; this.attach(this.socket);
  }
  close() { this.socket.destroy(); }
}
function connect(configuration: SmtpConfiguration): Promise<Socket | TLSSocket> {
  return new Promise((resolve, reject) => { const secure = configuration.tlsMode === 'implicit';
    const socket = secure ? tls.connect({ host: configuration.host, port: configuration.port, servername: configuration.host, minVersion: 'TLSv1.2' }) : net.connect({ host: configuration.host, port: configuration.port });
    socket.setTimeout(configuration.timeoutMs, () => socket.destroy(new Error('TIMEOUT')));
    const onError = () => { socket.removeListener(secure ? 'secureConnect' : 'connect', onConnect); reject(new NotificationTransportError(secure ? 'CONFIGURATION' : 'SMTP_TEMPORARY')); };
    const onConnect = () => { socket.setTimeout(0); socket.pause(); socket.removeListener('error', onError); resolve(socket); };
    socket.once('error', onError); socket.once(secure ? 'secureConnect' : 'connect', onConnect);
  });
}
export function createSmtpTransport(configuration: SmtpConfiguration): MailTransport {
  return { async send(message: MailMessage) {
    validateAddress(message.to); validateAddress(message.fromAddress);
    if (configuration.tlsMode === 'plain' && configuration.username) throw new NotificationTransportError('CONFIGURATION');
    const session = new SmtpSession(await connect(configuration), configuration.timeoutMs);
    try {
      if (!(await session.response()).startsWith('220')) throw new NotificationTransportError('SMTP_TEMPORARY');
      const ehlo = await session.command('EHLO invoices-app'); if (ehlo.code !== 250) throw new NotificationTransportError('SMTP_PERMANENT');
      if (configuration.tlsMode === 'starttls') { const start = await session.command('STARTTLS'); if (start.code !== 220) throw new NotificationTransportError('CONFIGURATION');
        await session.upgrade(configuration.host); await session.command('EHLO invoices-app'); }
      if (configuration.username) await session.command(`AUTH PLAIN ${Buffer.from(`\0${configuration.username}\0${configuration.password ?? ''}`).toString('base64')}`);
      await session.command(`MAIL FROM:<${message.fromAddress}>`); await session.command(`RCPT TO:<${message.to}>`); await session.command('DATA');
      const boundary = `=_invoices_${randomUUID().replace(/-/g, '')}`;
      const parts = [`From: ${message.fromName ? `${encoded(message.fromName)} ` : ''}<${message.fromAddress}>`, `To: <${message.to}>`,
        `Subject: ${encoded(message.subject)}`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
        `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64Lines(message.text)];
      if (message.html) parts.push(`--${boundary}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64Lines(message.html));
      parts.push(`--${boundary}--`, ''); const accepted = await session.sendData(parts.join('\r\n'));
      if (!accepted.startsWith('250')) throw new NotificationTransportError(accepted.startsWith('4') ? 'SMTP_TEMPORARY' : 'SMTP_PERMANENT');
      await session.command('QUIT').catch(() => undefined); return { serverReference: null };
    } catch (error) { if (error instanceof NotificationTransportError) throw error; throw new NotificationTransportError('SMTP_TEMPORARY'); }
    finally { session.close(); }
  } };
}
