import Link from 'next/link';
import {SERVICE_GUIDES} from '../lib/experience.mjs';

const generic = [
  'Write a short outline of the support you need.',
  'Note any dates, deadlines, or recent notices relevant to your enquiry.'
];

export default function EnquiryNextSteps({service,responseExpectation}) {
  const guide = SERVICE_GUIDES.find(item=>item.service === service);
  return <>
    <p>{responseExpectation || 'Our team will review your enquiry and contact you using the details you provided.'}</p>
    <h2>Prepare for your consultation</h2>
    {guide && <p>{guide.title}</p>}
    <ul>
      {(guide?.documents.slice(0,3) || generic).map(document=><li key={document}>{document}</li>)}
    </ul>
    <p>Keep your reference for follow-up. Wait for the team to confirm a secure way to share any sensitive documents.</p>
    <Link href="/resources">Explore preparation guides</Link>
  </>;
}
