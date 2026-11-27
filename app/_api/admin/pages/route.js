import {requirePublishingReview} from '../../../lib/content-review';
import { NextResponse } from 'next/server';
import { normalizePublication } from '../../../lib/publishing.mjs';
import { requirePermission } from '../../../lib/auth';
import { cleanSlug } from '../../../lib/utils';
import { getPages, getPageSummaries, insertPageRecord } from '../../../lib/store';
import { apiError } from '../../../lib/api-error';
import { writeSecurityAudit } from '../../../lib/security';
import { sanitizeCmsValue } from '../../../lib/validation';

export async function GET(request) {
  try {
    await requirePermission(request, 'pages:read');
    const summary = new URL(request.url).searchParams.get('summary') === 'true';
    const records = await (summary ? getPageSummaries() : getPages());
    const pages = [...records].sort((a,b) => (a.order || 999) - (b.order || 999) || a.id - b.id);
    return NextResponse.json({pages});
  }
  catch (error) { return apiError(error); }
}
export async function POST(request) {
  try {
    const session = await requirePermission(request, 'pages:write', { csrf: true });
    const payload = normalizePublication(sanitizeCmsValue(await request.json()));
    await requirePublishingReview(session,payload);
    if (payload.status === 'published') await requirePermission(request, 'pages:publish');
    const slug = cleanSlug(payload.slug || payload.title);
    if (['waitlist','client-portal','search','book-consultation','booking','blog','admin','api','robots.txt','sitemap.xml','reset-password'].includes(slug)) return NextResponse.json({ message: 'This URL slug is reserved. Choose another slug.' }, { status: 400 });
    const page = await insertPageRecord({
      ...payload, slug, status:payload.status || 'draft', title:payload.title || 'New Page',
      sections:Array.isArray(payload.sections) ? payload.sections : []
    },session.username);
    await writeSecurityAudit(request, session, 'page_created', `page:${page.id}`, { title: page.title, slug: page.slug, status: page.status });
    return NextResponse.json({ page });
  } catch (error) { return apiError(error); }
}
