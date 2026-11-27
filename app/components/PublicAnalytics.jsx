'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
const CONSENT_KEY='jmp-analytics-consent-v2';
export default function PublicAnalytics({measurementId='',enabled=false,visitorEnabled=true}) {
  const pathname=usePathname()||'/';
  const publicPage=!/^\/(admin|api|reset-password|client-portal|waitlist|booking\/manage)(\/|$)/.test(pathname);
  const googleActive=enabled&&/^G-[A-Z0-9]{4,20}$/.test(measurementId);
  const active=publicPage&&(visitorEnabled||googleActive);
  const [choice,setChoice]=useState(null),[loaded,setLoaded]=useState(false);
  const lastView=useRef('');
  useEffect(()=>{
    try{setChoice(navigator.globalPrivacyControl===true||navigator.doNotTrack==='1'?'declined':localStorage.getItem(CONSENT_KEY)||'ask');}catch{setChoice('ask');}
    const reopen=()=>setChoice('ask');window.addEventListener('jmp-analytics-preferences',reopen);
    return()=>window.removeEventListener('jmp-analytics-preferences',reopen);
  },[]);
  useEffect(()=>{
    const allowed=active&&choice==='allowed';
    window.__jmpVisitTrackingReady=allowed&&visitorEnabled;
    window.__jmpAnalyticsReady=allowed&&googleActive&&loaded;
    if(measurementId)window[`ga-disable-${measurementId}`]=!allowed||!googleActive;
    window.gtag?.('consent','update',{analytics_storage:allowed&&googleActive?'granted':'denied'});
    let cancelled=false;
    if(!allowed){
      lastView.current='';
      if(choice==='declined') import('../lib/visitor-browser.mjs').then(({clearVisitorContext})=>{
        if(!cancelled) clearVisitorContext();
      }).catch(()=>{});
    }
    return()=>{cancelled=true;window.__jmpVisitTrackingReady=false;window.__jmpAnalyticsReady=false;};
  },[active,choice,visitorEnabled,googleActive,loaded,measurementId]);
  useEffect(()=>{
    if(!active||choice!=='allowed'||!googleActive)return;
    if(window.__jmpLoadedAnalyticsId===measurementId){setLoaded(true);return;}
    window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
    window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    window.gtag('js',new Date());window.gtag('config',measurementId,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
    const script=document.createElement('script');script.async=true;script.src=`https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.onload=()=>{window.__jmpLoadedAnalyticsId=measurementId;setLoaded(true);};script.onerror=()=>setLoaded(false);document.head.appendChild(script);
    return()=>{script.onload=null;script.onerror=null;script.remove();};
  },[active,choice,googleActive,measurementId]);
  useEffect(()=>{
    if(!active||choice!=='allowed')return;
    let cancelled=false;
    if(visitorEnabled&&lastView.current!==pathname) import('../lib/visitor-browser.mjs').then(({sendVisit})=>{
      if(cancelled)return;
      sendVisit('page_view');lastView.current=pathname;
    }).catch(()=>{});
    const report=(name,linkType)=>import('../lib/analytics.mjs').then(({trackEvent})=>{
      if(!cancelled)trackEvent(name,{link_type:linkType});
    }).catch(()=>{});
    const click=event=>{const link=event.target.closest?.('a');if(!link)return;const href=link.getAttribute('href')||'';
      if(href.startsWith('tel:'))report('telephone_click','phone');
      else if(href.startsWith('mailto:'))report('email_click','email');
      else if(link.hasAttribute('download')||href.startsWith('/downloads/'))report('resource_download','resource');
      else if(href.split(/[?#]/)[0]==='/contact'&&link.matches('.btn,.text-cta,.nav-cta,.mobile-enquiry'))report('consultation_click','enquiry');
    };document.addEventListener('click',click);return()=>{cancelled=true;document.removeEventListener('click',click);};
  },[active,choice,visitorEnabled,pathname]);
  useEffect(()=>{if(active&&choice==='allowed'&&googleActive&&loaded){window.__jmpAnalyticsReady=true;window.gtag?.('event','page_view',{page_path:pathname,page_location:window.location.origin+pathname,page_title:document.title});}},[active,choice,googleActive,loaded,pathname]);
  function choose(value){try{localStorage.setItem(CONSENT_KEY,value);}catch{}setChoice(value);}
  if(!active||choice!=='ask')return null;
  return <div className="analytics-choice" role="region" aria-label="Usage analytics preference"><p>Allow optional analytics to help us improve this website. Your enquiry details are not included.</p><div><button type="button" onClick={()=>choose('declined')}>Decline</button><button type="button" onClick={()=>choose('allowed')}>Allow analytics</button></div></div>;
}
