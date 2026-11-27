import {NextResponse} from 'next/server';
import {requirePermission} from '../../../lib/auth';
import {apiError} from '../../../lib/api-error';
import {crmError} from '../../../lib/crm.mjs';
import {readJsonBody} from '../../../lib/http-body.mjs';
import {getMailStatus, readSmtpRecord, recordSmtpDeliveryTest, saveSmtpRecord} from '../../../lib/mail-provider';
import {openSmtp, sealSmtp, smtpConfig, smtpEncryptionReady} from '../../../lib/smtp-config.mjs';
import {createSmtpTransport, smtpMessage} from '../../../lib/smtp-transport.mjs';
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
    credentialsUnreadable:Boolean(record && encryptionReady && !config),
    lastDeliveryTest:config ? record?.lastDeliveryTest || null : null, mail:await getMailStatus()
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
    let previous;
    if (existing) {
      try { previous = openSmtp(existing.encrypted); } catch (error) { if (!payload.password) throw error; }
    }
    const config = smtpConfig(payload,previous);
    const unchanged = previous && JSON.stringify(config) === JSON.stringify(previous);
    const record = unchanged ? {...existing,enabled:payload.enabled} : {enabled:payload.enabled,encrypted:sealSmtp(config)};
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
    const payload = request.body ? await readJsonBody(request,2048) : {};
    const send = payload.action === 'send-test';
    if (payload.action && !send && payload.action !== 'verify') throw crmError('Choose a supported SMTP test.');
    const recipient = typeof payload.recipient === 'string' ? payload.recipient.trim() : '';
    if (send && (recipient.length > 254 || !/^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/.test(recipient))) throw crmError('Enter one valid recipient email address.');
    const limit = await rateLimit('smtp-test:'+session.userId,5,600);
    if (limit.unavailable) throw crmError('SMTP connection testing is temporarily unavailable.',503);
    if (!limit.allowed) return NextResponse.json({message:'Too many connection tests. Try again shortly.'},{status:429,headers:{'Retry-After':String(limit.retryAfter || 600)}});
    const record = await readSmtpRecord();
    if (!record) throw crmError('Save your SMTP settings before testing the connection.');
    const config = openSmtp(record.encrypted);
    let transport;
    let accepted = false;
    try {
      transport = await createSmtpTransport(config);
      if (send) {
        const result = await transport.sendMail(smtpMessage({to:[recipient],subject:'JMP SMTP delivery test',text:'JMP sent this test message using the SMTP settings saved by your super admin.'},config));
        accepted = result.accepted.length === 1;
      } else {
        await transport.verify();
      }
    } catch (error) {
      if (!send) {
        if (error?.code === 'CRM_ERROR') throw error;
        throw crmError('Could not verify SMTP. Check the server, port, TLS settings and SMTP credentials.',502);
      }
    } finally {
      transport?.close();
    }
    if (send) {
      const lastDeliveryTest = {status:accepted ? 'accepted' : 'failed', at:new Date().toISOString()};
      await recordSmtpDeliveryTest(record,lastDeliveryTest);
      await writeSecurityAudit(request,session,'smtp_delivery_tested','outbound_smtp',{status:lastDeliveryTest.status});
      return NextResponse.json({lastDeliveryTest},noCache);
    }
    await writeSecurityAudit(request,session,'smtp_connection_verified','outbound_smtp');
    return NextResponse.json({verified:true},noCache);
  } catch (error) {
    return apiError(error,'SMTP connection testing failed.');
  }
}
