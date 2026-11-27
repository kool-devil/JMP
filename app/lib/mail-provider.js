import {supabaseAdmin} from './supabase';
import {storageRequired} from './runtime-store';
import {mailConfiguration} from './enquiry-mail.mjs';
import {openSmtp} from './smtp-config.mjs';

const smtpRecord = 'outbound_smtp';

export async function readSmtpRecord() {
  const db = supabaseAdmin();
  if (!db) return null;
  const {data,error} = await db.from('cms_integrations').select('data').eq('id',smtpRecord).maybeSingle();
  if (['42P01','PGRST205'].includes(error?.code)) return null;
  if (error) throw storageRequired(error);
  return data?.data || null;
}

export async function saveSmtpRecord(data) {
  const db = supabaseAdmin();
  if (!db) throw storageRequired();
  const {error} = await db.from('cms_integrations').upsert({id:smtpRecord,data,updated_at:new Date().toISOString()});
  if (error) throw storageRequired(error);
}

export async function recordSmtpDeliveryTest(record, result) {
  const db = supabaseAdmin();
  if (!db) throw storageRequired();
  const {error} = await db.from('cms_integrations').update({data:{...record,lastDeliveryTest:result}})
    .eq('id',smtpRecord).eq('data->>encrypted',record.encrypted).eq('data->>enabled',String(record.enabled));
  if (error) throw storageRequired(error);
}

export async function getMailProvider(environment = process.env) {
  const smtp = await readSmtpRecord();
  if (smtp?.enabled) return {provider:'SMTP',smtp:openSmtp(smtp.encrypted,environment)};
  return mailConfiguration(environment).configured ? {provider:'Resend'} : null;
}

export async function getMailStatus(environment = process.env) {
  try {
    const provider = await getMailProvider(environment);
    return {provider:provider?.provider || null, configured:Boolean(provider)};
  } catch {
    return {provider:null, configured:false};
  }
}
