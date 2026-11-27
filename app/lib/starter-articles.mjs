const starterArticles = [
  {
    id:'starter-first-consultation',
    slug:'prepare-for-your-first-consultation',
    status:'published',
    template:'blog',
    title:'How to prepare for your first consultation',
    blogCategory:'Getting started',
    heroText:'A short checklist to help you explain what you need and get more from the first conversation.',
    metaDescription:'Prepare for your first accounting, tax or compliance consultation with a short, practical checklist.',
    sections:[
      {type:'text', title:'Write down what you want to resolve', text:'- Describe your question in a few sentences.\n- Note whether it relates to you personally or to a business. For a business, include the entity type and the period concerned.\n- List any known dates and previous steps. If a notice prompted the enquiry, note its date and the stated response deadline.'},
      {type:'text', title:'Make a list of records you have', text:'Depending on your question, useful records might include recent statements or filings, prior correspondence, and an outline of the accounting records you use. Make a list of what is available and what you still need to locate.\n\nKeep documents and identifiers ready for a secure handover. Share only a brief summary in the public enquiry form.'},
      {type:'text', title:'Plan your questions', text:'Ask about the scope of work, which records the team needs, the secure way to share them, and the next steps. Use the [first-discussion checklist](/downloads/first-discussion-checklist.txt) to make your notes.'},
      {type:'cta', title:'Discuss your requirement', text:'Tell the team what you would like to resolve and whether there is a relevant deadline.', buttonText:'Request a consultation', buttonUrl:'/contact#enquiry-form'}
    ]
  },
  {
    id:'starter-gst-audit-records',
    slug:'organise-records-for-gst-or-audit',
    status:'published',
    template:'blog',
    title:'Organising business records for a GST or audit discussion',
    blogCategory:'Business records',
    heroText:'Start with the period, the records you already hold, and a list of items that need clarification.',
    metaDescription:'Use this preparation guide to organise invoices, reconciliations, and supporting records before a GST or audit discussion.',
    sections:[
      {type:'text', title:'Start with the entity and period', text:'Identify the business, the period you want to discuss, and your accounting software or record format. Note what prompted the discussion and any relevant correspondence or deadline.'},
      {type:'text', title:'For a GST discussion', text:'- List the sales and purchase registers and available invoices or credit notes.\n- Identify the returns and reconciliation reports you already have.\n- Note gaps or differences you want the team to review.\n\nSee [GST and indirect tax services](/our-services#gst-indirect-tax) or [start a GST enquiry](/contact?service=GST%20Compliance#enquiry-form).'},
      {type:'text', title:'For an audit discussion', text:'- Locate the trial balance, financial statements, and bank reconciliations for the relevant period, if available.\n- List supporting schedules and prior reports. Keep a separate note of anything missing.\n- Identify who can answer questions about the records and the accounting process.\n\nSee [audit and assurance services](/our-services#audit-assurance) or [start an audit enquiry](/contact?service=Audit%20%26%20Assurance#enquiry-form).'},
      {type:'text', title:'Share records securely', text:'Use the [business records checklist](/downloads/business-records-checklist.txt) as a starting point. The team can confirm which documents are relevant to your scope and how to share them securely.'}
    ]
  }
];

export function withStarterArticles(pages) {
  const existingSlugs = new Set(pages.map(page => page.slug));
  return [...pages, ...starterArticles.filter(article => !existingSlugs.has(article.slug))];
}
