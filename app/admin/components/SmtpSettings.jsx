'use client';

import {useEffect,useState} from 'react';

const endpoint = '/api/admin/smtp';
const emptySettings = {host:'',port:587,username:'',fromEmail:'',fromName:'',password:'',enabled:false};

export default function SmtpSettings({api,Field,onSaved}) {
  const [form,setForm] = useState(emptySettings);
  const [status,setStatus] = useState(null);
  const [pending,setPending] = useState('load');
  const [feedback,setFeedback] = useState(null);
  const [dirty,setDirty] = useState(false);
  const [testRecipient,setTestRecipient] = useState('');

  function loadState(value) {
    setStatus(value);
    setForm({...emptySettings,...value.settings,enabled:value.enabled});
    setDirty(false);
  }

  useEffect(() => {
    let active = true;
    api(endpoint).then(value => {
      if (active) loadState(value);
    }).catch(error => {
      if (active) setFeedback({error:true,text:error.message});
    }).finally(() => {
      if (active) setPending('');
    });
    return () => {active = false;};
  }, []);

  function change(key,value) {
    setForm(current => ({...current,[key]:value}));
    setDirty(true);
    setFeedback(null);
  }

  async function submit(event) {
    event.preventDefault();
    await update(form,'SMTP settings saved.');
  }

  async function update(payload,message) {
    setPending('save');
    setFeedback(null);
    try {
      const value = await api(endpoint,{method:'PUT',body:JSON.stringify(payload)});
      loadState(value);
      onSaved(value.mail);
      setFeedback({text:message});
    } catch (error) {
      setFeedback({error:true,text:error.message});
    } finally {
      setPending('');
    }
  }

  async function verify() {
    setPending('verify');
    setFeedback(null);
    try {
      await api(endpoint,{method:'POST'});
      setFeedback({text:'The SMTP server accepted the encrypted connection and credentials.'});
    } catch (error) {
      setFeedback({error:true,text:error.message});
    } finally {
      setPending('');
    }
  }

  async function sendTest(event) {
    event.preventDefault();
    setPending('send');
    setFeedback(null);
    try {
      const {lastDeliveryTest} = await api(endpoint,{
        method:'POST',body:JSON.stringify({action:'send-test',recipient:testRecipient})
      });
      setStatus(current=>({...current,lastDeliveryTest}));
      setFeedback(lastDeliveryTest.status === 'accepted'
        ? {text:'The SMTP server accepted the test message. Check the recipient inbox and spam folder.'}
        : {error:true,text:'The test message could not be sent. Check the SMTP settings and sender address.'});
    } catch (error) {
      setFeedback({error:true,text:error.message});
    } finally {
      setPending('');
    }
  }

  return <section className="admin-card">
    <div className="admin-page-head"><div><h2>SMTP settings</h2><p className="small">Configure outgoing email for enquiries, bookings, and client portal notifications.</p></div></div>
    {feedback && <p className={feedback.error ? 'inline-warning' : 'small'} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    {pending === 'load' && <p role="status">Loading SMTP settings…</p>}
    {status && <>
      <p className="small">Active provider: {status.mail.provider || 'None'}</p>
      {!status.encryptionReady && <p className="inline-warning">Set SMTP_CONFIG_ENCRYPTION_KEY in the hosting environment and redeploy to save SMTP credentials.</p>}
      {status.credentialsUnreadable && <p className="inline-warning">The saved credentials could not be opened. Enter the SMTP settings again to replace them.</p>}
      <form onSubmit={submit}>
        <fieldset disabled={Boolean(pending) || !status.encryptionReady}>
          <div className="admin-grid">
            <Field label="SMTP server" value={form.host} required placeholder="smtp.example.com" onChange={value=>change('host',value)}/>
            <div className="field">
              <label htmlFor="smtp-port">Port and encryption</label>
              <select id="smtp-port" value={form.port} onChange={event=>change('port',Number(event.target.value))}>
                <option value={587}>587 · STARTTLS</option>
                <option value={465}>465 · TLS</option>
              </select>
            </div>
            <Field label="SMTP username" value={form.username} required autoComplete="off" onChange={value=>change('username',value)}/>
            <Field label="SMTP password" type="password" value={form.password} required={!status.settings?.hasPassword} autoComplete="new-password" onChange={value=>change('password',value)} help={status.settings?.hasPassword ? 'Leave blank to keep the saved password. Enter it again when changing the server, port, or username.' : 'Use your provider’s SMTP password or app password.'}/>
            <Field label="Verified sender email" type="email" value={form.fromEmail} required onChange={value=>change('fromEmail',value)}/>
            <Field label="Sender name" value={form.fromName} onChange={value=>change('fromName',value)}/>
          </div>
          <label className="check-row"><input type="checkbox" checked={form.enabled} onChange={event=>change('enabled',event.target.checked)}/>Use SMTP for outgoing site email</label>
          <p className="small">When SMTP is disabled, the site uses Resend if it is configured. Account emails sent directly by Supabase Auth use the Supabase project’s email settings.</p>
          <div className="admin-actions">
            <button className="admin-btn" type="submit" disabled={!dirty}>{pending === 'save' ? 'Saving…' : 'Save SMTP settings'}</button>
            <button className="admin-btn light" type="button" onClick={verify} disabled={!status.settings || dirty}>{pending === 'verify' ? 'Testing…' : 'Test saved connection'}</button>
          </div>
        </fieldset>
      </form>
      {status.settings && <form className="settings-extension" onSubmit={sendTest}>
        <h3>Test email delivery</h3>
        <Field label="Test recipient" type="email" value={testRecipient} required onChange={setTestRecipient}/>
        <button type="submit" className="admin-btn light" disabled={Boolean(pending) || dirty}>{pending === 'send' ? 'Sending…' : 'Send test email'}</button>
        {status.lastDeliveryTest && <p className="small">Latest test: {status.lastDeliveryTest.status === 'accepted' ? 'Accepted by the SMTP server' : 'Failed'} · <time dateTime={status.lastDeliveryTest.at}>{new Date(status.lastDeliveryTest.at).toLocaleString()}</time></p>}
      </form>}
      {(!status.encryptionReady || status.credentialsUnreadable) && status.enabled && <button type="button" className="admin-btn light" disabled={Boolean(pending)} onClick={()=>update({action:'disable'},'SMTP disabled.')}>Disable SMTP</button>}
    </>}
  </section>;
}
