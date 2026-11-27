import {afterEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {Module} from 'node:module';
import path from 'node:path';
import {build} from 'esbuild';
import {openSmtp,sealSmtp,smtpConfig} from '../app/lib/smtp-config.mjs';
import {resolveSmtpAddress,smtpMessage} from '../app/lib/smtp-transport.mjs';

const environment = {SMTP_CONFIG_ENCRYPTION_KEY:'ab'.repeat(32)};
const input = {host:'smtp.example.com',port:587,username:'test-user',password:'test-password',fromEmail:'mail@example.com',fromName:'JMP',enabled:true};

test('SMTP encryption authenticates stored credentials and keeps an existing password only for the same connection', () => {
  const config = smtpConfig(input);
  const encrypted = sealSmtp(config,environment);
  assert.ok(!encrypted.includes(config.password));
  assert.deepEqual(openSmtp(encrypted,environment),config);
  assert.throws(()=>openSmtp(encrypted,{SMTP_CONFIG_ENCRYPTION_KEY:'cd'.repeat(32)}),/could not be decrypted/);
  assert.equal(smtpConfig({...input,password:'',fromName:'New name'},config).password,input.password);
  assert.throws(()=>smtpConfig({...input,password:'',host:'smtp2.example.com'},config),/Re-enter/);
  assert.throws(()=>smtpConfig({...input,port:25}),/465/);
  assert.throws(()=>smtpConfig({...input,host:'127.0.0.1'}),/public server/);
});

test('SMTP resolves to a pinned public address and refuses private or mixed DNS answers', async () => {
  const check = addresses => resolveSmtpAddress('smtp.example.com', async()=>addresses.map(address=>({address,family:address.includes(':') ? 6 : 4})));
  assert.equal(await check(['2606:4700:4700::1111','8.8.8.8']),'8.8.8.8');
  for (const address of ['127.0.0.1','10.0.0.2','100.64.0.1','::1','::ffff:192.168.1.1','169.254.169.254']) {
    await assert.rejects(check(['8.8.8.8',address]),/public internet/);
  }
});

test('SMTP sets the verified sender, preserves reply-to, and gives retries a stable message identifier', () => {
  const message = {to:['client@example.com'],reply_to:'staff@example.com',from:'untrusted@example.com',subject:'Enquiry',text:'Example'};
  const result = smtpMessage(message,smtpConfig(input),'retry-key');
  assert.deepEqual(result.from,{name:'JMP',address:'mail@example.com'});
  assert.deepEqual(result.to,message.to);
  assert.equal(result.replyTo,message.reply_to);
  assert.equal(result.messageId,'<retry-key@example.com>');
});

afterEach(()=>delete globalThis.__jmpSmtpTest);
const adapters = {
  auth: "export async function requirePermission(req, permission, options) { const session = {role:req.headers.get('x-role'),userId:'test-id'}; globalThis.__jmpSmtpTest.permission=permission; if (session.role !== 'super_admin' || (options?.csrf && !req.headers.get('x-csrf-token'))) throw Object.assign(new Error('Forbidden'),{status:403}); return session; }",
  security: "export const rateLimit = async ()=>({allowed:true}); export async function writeSecurityAudit(){}",
  'api-error': "export const apiError=(error,fallback)=>Response.json({message:error.message || fallback},{status:error.status || 500});",
  supabase: "export const supabaseAdmin=()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{data:globalThis.__jmpSmtpTest.record}})})}),upsert:async row=>{globalThis.__jmpSmtpTest.record=row.data;return {};}})});",
  'smtp-transport.mjs': "export async function createSmtpTransport(config){ return {verify:async()=>{globalThis.__jmpSmtpTest.verified=config.host;},close(){}}; }"
};

async function smtpRoute() {
  const result = await build({
    entryPoints:['app/_api/admin/smtp/route.js'], bundle:true, write:false, format:'cjs', platform:'node', external:['next/server'],
    plugins:[{name:'smtp-test-adapters',setup(builder){
      builder.onResolve({filter:/\/lib\//},args=>{
        const name = args.path.split('/').at(-1);
        if (adapters[name]) return {path:name,namespace:'smtp-test'};
      });
      builder.onResolve({filter:/^\.\/supabase$/},()=>({path:'supabase',namespace:'smtp-test'}));
      builder.onLoad({filter:/.*/,namespace:'smtp-test'},args=>({contents:adapters[args.path],loader:'js'}));
    }}]
  });
  const filename = path.resolve('tests/.smtp-route.cjs');
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(result.outputFiles[0].text,filename);
  return loaded.exports;
}

test('SMTP settings deny ordinary admins, require CSRF, and never return the saved password', async () => {
  const key = process.env.SMTP_CONFIG_ENCRYPTION_KEY;
  process.env.SMTP_CONFIG_ENCRYPTION_KEY = environment.SMTP_CONFIG_ENCRYPTION_KEY;
  globalThis.__jmpSmtpTest = {};
  const request = (method,role,body,csrf = false) => new Request('https://example.com/api/admin/smtp',{
    method,headers:{'Content-Type':'application/json','x-role':role,...(csrf && {'x-csrf-token':'test'})},
    ...(body && {body:JSON.stringify(body)})
  });
  try {
    const route = await smtpRoute();
    assert.equal((await route.GET(request('GET','admin'))).status,403);
    assert.equal(globalThis.__jmpSmtpTest.permission,'smtp:manage');
    assert.equal((await route.PUT(request('PUT','super_admin',input))).status,403);
    const saved = await route.PUT(request('PUT','super_admin',input,true));
    assert.equal(saved.status,200);
    const response = await saved.json();
    assert.equal(response.mail.provider,'SMTP');
    assert.equal(response.settings.hasPassword,true);
    assert.equal(response.settings.password,undefined);
    assert.ok(!JSON.stringify(globalThis.__jmpSmtpTest.record).includes(input.password));
    assert.equal((await route.POST(request('POST','admin',null,true))).status,403);
    assert.equal((await route.POST(request('POST','super_admin',null,true))).status,200);
    assert.equal(globalThis.__jmpSmtpTest.verified,input.host);
    const disabled = await route.PUT(request('PUT','super_admin',{...input,password:'',enabled:false},true));
    assert.equal((await disabled.json()).enabled,false);
  } finally {
    if (key === undefined) delete process.env.SMTP_CONFIG_ENCRYPTION_KEY;
    else process.env.SMTP_CONFIG_ENCRYPTION_KEY = key;
  }
});
