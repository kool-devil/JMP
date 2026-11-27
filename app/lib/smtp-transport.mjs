import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import {crmError} from './crm.mjs';

export async function resolveSmtpAddress(host, lookup = dns.lookup) {
  const results = await lookup(host,{all:true,verbatim:true});
  if (!results.length || results.some(({address}) => !ipaddr.isValid(address) || ipaddr.parse(address).range() !== 'unicast')) {
    throw crmError('The SMTP host must resolve to public internet addresses.');
  }
  return (results.find(result => result.family === 4) || results[0]).address;
}

export async function createSmtpTransport(config) {
  const address = await resolveSmtpAddress(config.host);
  const {default:nodemailer} = await import('nodemailer');
  return nodemailer.createTransport({
    host:address,
    port:config.port,
    secure:config.port === 465,
    requireTLS:config.port === 587,
    auth:{user:config.username,pass:config.password},
    tls:{servername:config.host,minVersion:'TLSv1.2',rejectUnauthorized:true},
    connectionTimeout:5000,
    greetingTimeout:5000,
    socketTimeout:7000,
    disableFileAccess:true,
    disableUrlAccess:true
  });
}

export function smtpMessage(message, config, key) {
  return {
    from:{name:config.fromName,address:config.fromEmail},
    to:message.to,
    replyTo:message.reply_to,
    subject:message.subject,
    text:message.text,
    ...(key && {messageId:'<'+key.replace(/[^a-z0-9_.-]/gi,'-')+'@'+config.fromEmail.split('@').at(-1)+'>'})
  };
}
