import {NextResponse} from 'next/server';
import {requirePermission} from '../../../lib/auth';
import {apiError} from '../../../lib/api-error';
import {crmError} from '../../../lib/crm.mjs';
import {readJsonBody} from '../../../lib/http-body.mjs';
import {getMailStatus, readSmtpRecord, saveSmtpRecord} from '../../../lib/mail-provider';
import {openSmtp, sealSmtp, smtpConfig, smtpEncryptionReady} from '../../../lib/smtp-config.mjs';
import {createSmtpTransport} from '../../../lib/smtp-transport.mjs';
import {rateLimit, writeSecurityAudit} from '../../../lib/security';

const permission = 'smtp:manage';
const noCache = {headers:{'Cache-Control':'private, no-store'}};

async function response(record) {
  const encryptionReady = smtpEncryptionReady();
  let config = null;
  if (record && encryptionReady) {
    try { config = openSmtp(record.encrypted); } catch { /* Allow replacing unreadable credentials. */ }
  }
  const settings = config ? {
    host:config.host, port:config.port, username:config.username,
    fromEmail:config.fromEmail, fromName:config.fromName, hasPassword:true
  } : null;
  return NextResponse.json({
    settings, enabled:record?.enabled === true, encryptionReady,
    credentialsUnreadable:Boolean(record && encryptionReady && !config), mail:await getMailStatus()
  },noCache);
}

export async function GET(request) {
  try {
    await requirePermission(request,permission);
    return await response(await readSmtpRecord());
  } catch (error) {
    return apiError(error,'SMTP settings could not be loaded.');
  }
}

export async function PUT(request) {
  try {
    const session = await requirePermission(request,permission,{csrf:true});
    const payload = await readJsonBody(request,8192);
    const existing = await readSmtpRecord();
    if (payload.action === 'disable') {
      if (existing?.enabled) await saveSmtpRecord({...existing,enabled:false});
      await writeSecurityAudit(request,session,'smtp_disabled','outbound_smtp');
      return await response(existing ? {...existing,enabled:false} : null);
    }
    const previous = existing && !payload.password ? openSmtp(existing.encrypted) : null;
    const config = smtpConfig(payload,previous);
    const record = {enabled:payload.enabled,encrypted:sealSmtp(config)};
    await saveSmtpRecord(record);
    await writeSecurityAudit(request,session,'smtp_settings_saved','outbound_smtp',{enabled:record.enabled});
    return await response(record);
  } catch (error) {
    return apiError(error,'SMTP settings could not be saved.');
  }
}

export async function POST(request) {
  try {
    const session = await requirePermission(request,permission,{csrf:true});
    const limit = await rateLimit('smtp-test:'+session.userId,5,600);
    if (limit.unavailable) throw crmError('SMTP connection testing is temporarily unavailable.',503);
    if (!limit.allowed) return NextResponse.json({message:'Too many connection tests. Try again shortly.'},{status:429,headers:{'Retry-After':String(limit.retryAfter || 600)}});
    const record = await readSmtpRecord();
    if (!record) throw crmError('Save your SMTP settings before testing the connection.');
    const config = openSmtp(record.encrypted);
    let transport;
    try {
      transport = await createSmtpTransport(config);
      await transport.verify();
    } catch (error) {
      if (error?.code === 'CRM_ERROR') throw error;
      throw crmError('Could not verify SMTP. Check the server, port, TLS settings and SMTP credentials.',502);
    } finally {
      transport?.close();
    }
    await writeSecurityAudit(request,session,'smtp_connection_verified','outbound_smtp');
    return NextResponse.json({verified:true},noCache);
  } catch (error) {
    return apiError(error,'SMTP connection testing failed.');
  }
}
