'use client';

import {useEffect,useRef,useState} from 'react';

const preparationWindow = 7 * 86400000;
const appointmentDate = new Intl.DateTimeFormat('en-IN', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'});

export default function DashboardWorkQueue({api,navigate,enquiries,bookings,operations,newCount,overdueCount}) {
  const apiRef = useRef(api);
  apiRef.current = api;
  const [appointmentStatus,setAppointmentStatus] = useState({loading:bookings});
  const [mailStatus,setMailStatus] = useState({loading:operations});

  useEffect(() => {
    const controller = new AbortController();
    const request = (path,transform,setStatus) => {
      setStatus({loading:true});
      apiRef.current(path,{signal:controller.signal}).then(data => {
        if (!controller.signal.aborted) setStatus(transform(data));
      }).catch(() => {
        if (!controller.signal.aborted) setStatus({error:true});
      });
    };
    if (bookings) request('/api/admin/bookings',data => {
      const now = Date.now();
      const upcoming = (data.bookings || []).filter(booking => {
        const start = Date.parse(booking.start);
        return booking.status === 'confirmed' && start >= now && start <= now + preparationWindow;
      }).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
      return {count:upcoming.length, next:upcoming[0]?.start};
    },setAppointmentStatus);
    if (operations) request('/api/admin/operations',data => data.ready ? {count:data.queue?.failed || 0} : {error:true},setMailStatus);
    return () => controller.abort();
  },[bookings,operations]);

  const items = [
    ...(enquiries ? [
      {label:'New enquiries',value:newCount,destination:'enquiries',action:'Open enquiries'},
      {label:'Overdue replies',value:overdueCount,destination:'followups',action:'Review follow-ups'}
    ] : []),
    ...(bookings ? [{label:'Consultations in the next 7 days', status:appointmentStatus, detail:appointmentStatus.next ? 'Next: '+appointmentDate.format(new Date(appointmentStatus.next))+' IST' : '', destination:'operations',action:'View appointments'}] : []),
    ...(operations ? [{label:'Failed emails',status:mailStatus,destination:'operations',action:'Review delivery'}] : [])
  ];

  if (!items.length) return null;
  return <section className="admin-card" aria-labelledby="dashboard-work-heading">
    <h3 id="dashboard-work-heading">Needs attention</h3>
    <ul className="dashboard-work-list">
      {items.map(({label,value,status,detail,destination,action})=><li key={label}>
        <div><strong>{label}</strong>{detail && <small>{detail}</small>}</div>
        <span>{status?.loading ? 'Loading…' : status?.error ? 'Unavailable' : status?.count ?? value}</span>
        <button className="text-link" type="button" onClick={()=>navigate(destination)}>{action}</button>
      </li>)}
    </ul>
  </section>;
}
