import Link from 'next/link';
import BookingForm from '../components/BookingForm';
import {getSettings} from '../lib/public-store';

export const dynamic = 'force-dynamic';
export const metadata = {title:'Book a consultation | JMP', robots:{index:false, follow:true}};

export default async function BookConsultation() {
  const settings = await getSettings().catch(() => {
    console.error('Public booking settings unavailable');
    return null;
  });

  return <main id="main-content" className="public-main" tabIndex={-1}>
    <section className="section">
      <div className="container booking-page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span aria-hidden="true">/</span>
          <Link href="/contact">Contact</Link><span aria-hidden="true">/</span>
          <span aria-current="page">Consultation</span>
        </nav>
        <h1>Book a consultation.</h1>
        {settings?.bookingEnabled ? <>
          <BookingForm services={settings.formServices}/>
          <p>Prefer to speak with the team? <Link href="/contact#enquiry-form">Send an enquiry</Link>.</p>
        </> : <div className="booking-unavailable">
          <h2>Let’s arrange a suitable time.</h2>
          <p>Online bookings are currently unavailable. Send an enquiry and the team will help arrange your consultation.</p>
          <Link className="btn" href="/contact#enquiry-form">Request a consultation</Link>
        </div>}
      </div>
    </section>
  </main>;
}
