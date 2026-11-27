export function calendarEnvironment(environment = process.env) {
  const mode = 'service_account';
  try {
    const credentials = JSON.parse(environment.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON || '{}');
    const serviceEmail = credentials?.client_email || '';
    return {configured:Boolean(serviceEmail && credentials.private_key), serviceEmail, mode};
  } catch {
    return {configured:false, serviceEmail:'', mode};
  }
}

export function bookingAvailable(settings, environment = process.env) {
  return settings.bookingEnabled === true &&
    Boolean(String(settings.bookingCalendarId || '').trim()) &&
    calendarEnvironment(environment).configured;
}
