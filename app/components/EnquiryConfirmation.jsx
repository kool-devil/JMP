'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import EnquiryNextSteps from './EnquiryNextSteps';

export default function EnquiryConfirmation({responseExpectation}) {
  const [receipt,setReceipt] = useState(null);
  useEffect(()=>{
    try {
      const value = JSON.parse(sessionStorage.getItem('jmp-enquiry-receipt') || 'null');
      if (value && Date.now()-value.at < 86400000 && /^JMP-\d{6,}$/.test(value.reference)) setReceipt(value);
    } catch {}
  },[]);
  return <section className="section">
    <div className="container">
      <div className="enquiry-receipt">
        {receipt && <span className="receipt-check" aria-hidden="true">✓</span>}
        <h1>{receipt ? 'Your enquiry has been received.' : 'What happens after an enquiry'}</h1>
        {receipt && <p className="receipt-reference">Your reference: <strong>{receipt.reference}</strong></p>}
        <EnquiryNextSteps service={receipt?.service} responseExpectation={responseExpectation}/>
        <div className="hero-actions"><Link className="btn outline" href="/">Back to home</Link></div>
      </div>
    </div>
  </section>;
}
