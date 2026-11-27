import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {crmError} from './crm.mjs';

const context = Buffer.from('jmp-smtp-v1');
const mailbox = /^[^\s<>(),;:"@\\]+@[^\s<>(),;:"@\\]+\.[^\s<>(),;:"@\\]+$/;
const dnsName = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/i;

function encryptionKey(environment) {
  const value = environment.SMTP_CONFIG_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw crmError('SMTP encryption is unavailable. Set SMTP_CONFIG_ENCRYPTION_KEY to a 32-byte hex key in the hosting environment.',503);
  return Buffer.from(value,'hex');
}

export function smtpEncryptionReady(environment = process.env) {
  return /^[a-f0-9]{64}$/i.test(environment.SMTP_CONFIG_ENCRYPTION_KEY || '');
}

export function sealSmtp(config, environment = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',encryptionKey(environment),iv);
  cipher.setAAD(context);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64url');
}

export function openSmtp(value, environment = process.env) {
  const key = encryptionKey(environment);
  try {
    const input = Buffer.from(value,'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, input.subarray(0,12));
    decipher.setAAD(context);
    decipher.setAuthTag(input.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(input.subarray(28)),decipher.final()]).toString('utf8'));
  } catch {
    throw crmError('The saved SMTP settings could not be decrypted. Check the hosting encryption key.',503);
  }
}

export function smtpConfig(payload, previous) {
  const host = typeof payload.host === 'string' ? payload.host.trim().toLowerCase() : '';
  if (!dnsName.test(host) || isIP(host) || /\.(localhost|local|internal|lan|test|invalid)$/.test(host)) throw crmError('Enter your SMTP provider’s public server hostname.');
  const port = Number(payload.port);
  if (port !== 465 && port !== 587) throw crmError('Choose port 465 for TLS or 587 for STARTTLS.');
  const username = typeof payload.username === 'string' ? payload.username.trim() : '';
  if (!username || username.length > 255 || /[\r\n\0]/.test(username)) throw crmError('Enter a valid SMTP username.');
  const fromEmail = typeof payload.fromEmail === 'string' ? payload.fromEmail.trim() : '';
  if (fromEmail.length > 254 || !mailbox.test(fromEmail)) throw crmError('Enter the sender email address verified by your SMTP provider.');
  const fromName = typeof payload.fromName === 'string' ? payload.fromName.trim() : '';
  if (fromName.length > 120 || /[\r\n\0]/.test(fromName)) throw crmError('Enter a sender name of up to 120 characters.');
  const sameConnection = previous?.host === host && previous.port === port && previous.username === username;
  const password = payload.password === '' || payload.password == null
    ? (sameConnection ? previous.password : '')
    : payload.password;
  if (typeof password !== 'string' || !password.length || password.length > 2048 || /[\r\n\0]/.test(password)) throw crmError('Enter the SMTP password or app password. Re-enter it when the connection details change.');
  if (typeof payload.enabled !== 'boolean') throw crmError('Choose whether to enable SMTP delivery.');
  return {host,port,username,password,fromEmail,fromName};
}
