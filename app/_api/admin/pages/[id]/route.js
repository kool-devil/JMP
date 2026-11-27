import {requirePublishingReview} from '../../../../lib/content-review';
import { NextResponse } from 'next/server';
import { normalizePublication } from '../../../../lib/publishing.mjs';
import { requirePermission } from '../../../../lib/auth';
import { cleanSlug } from '../../../../lib/utils';
import { findPageById, updatePageRecord, removePageRecord } from '../../../../lib/store';
import { apiError } from '../../../../lib/api-error';
import { writeSecurityAudit } from '../../../../lib/security';
import { sanitizeCmsValue } from '../../../../lib/validation';

export async function GET(request, {params}) {
  try {
    await requirePermission(request,'pages:read');
    const {id} = await params;
    const page = await findPageById(Number(id));
    if (!page) return NextResponse.json({message:'Page not found.'},{status:404});
    return NextResponse.json({page});
  } catch (error) { return apiError(error); }
}

export async function PUT(request, { params }) {
  try {
    const session = await requirePermission(request, 'pages:write', { csrf: true });
    const { id } = await params; const payload = normalizePublication(sanitizeCmsValue(await request.json())); const pageId = Number(id);
    const currentPage = await findPageById(pageId);
    if (!currentPage) return NextResponse.json({ message: 'Page not found.' }, { status: 404 });
    await requirePublishingReview(session,payload,currentPage);
    if (payload.updatedAt && currentPage.updatedAt && String(payload.updatedAt) !== String(currentPage.updatedAt)) {
      return NextResponse.json({ message: `This page was changed by ${currentPage.updatedBy || 'another administrator'} after you opened it. Reload the latest version before saving so their work is not overwritten.`, code: 'EDIT_CONFLICT', currentUpdatedAt: currentPage.updatedAt }, { status: 409 });
    }
    if (payload.status === 'published') await requirePermission(request, 'pages:publish');
    const slug = currentPage.slug === 'home' ? 'home' : cleanSlug(payload.slug || payload.title);
    if (['waitlist','client-portal','search','book-consultation','booking','blog','admin','api','robots.txt','sitemap.xml','reset-password'].includes(slug)) return NextResponse.json({ message: 'This URL slug is reserved. Choose another slug.' }, { status: 400 });
    const updated = await updatePageRecord({
      ...currentPage, ...payload, id:pageId, slug,
      sections:Array.isArray(payload.sections) ? payload.sections : []
    },currentPage.updatedAt,session.username);
    await writeSecurityAudit(request, session, 'page_updated', `page:${pageId}`, { title: updated.title, slug: updated.slug, status: updated.status });
    return NextResponse.json({ page: updated });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request, { params }) {
  try {
    const session = await requirePermission(request, 'pages:delete', { csrf: true }); const { id } = await params; const pageId = Number(id);
    const page = await findPageById(pageId);
    if (!page) return NextResponse.json({ message: 'Page not found.' }, { status: 404 });
    if (page.slug === 'home') return NextResponse.json({ message: 'Home page cannot be deleted.' }, { status: 400 });
    await removePageRecord(page);
    await writeSecurityAudit(request, session, 'page_deleted', `page:${pageId}`, { title: page.title, slug: page.slug });
    return NextResponse.json({ success: true });
  } catch (error) { return apiError(error); }
}
