import {requirePublishingReview} from '../../../../../lib/content-review';
import { NextResponse } from 'next/server';
import { requirePermission } from '../../../../../lib/auth';
import { findPageById, getPageRevisions, updatePageRecord } from '../../../../../lib/store';
import { apiError } from '../../../../../lib/api-error';
import { writeSecurityAudit } from '../../../../../lib/security';

export async function GET(request, { params }) {
  try {
    await requirePermission(request, 'pages:read');
    const {id} = await params;
    return NextResponse.json({revisions:await getPageRevisions(Number(id))});
  }
  catch (error) { return apiError(error); }
}
export async function POST(request, { params }) {
  try {
    const session = await requirePermission(request, 'pages:restore', { csrf: true }); const { id } = await params; const pageId = Number(id); const { revisionId } = await request.json();
    const [current, revisions] = await Promise.all([findPageById(pageId),getPageRevisions(pageId)]);
    if (!current) return NextResponse.json({ message: 'Page not found.' }, { status: 404 });
    const revision = revisions.find(item => String(item.id) === String(revisionId));
    if (!revision?.page) return NextResponse.json({ message: 'Revision not found.' }, { status: 404 });
    await requirePublishingReview(session,revision.page,current);
    const restored = await updatePageRecord({...revision.page,id:pageId},current.updatedAt,session.username);
    await writeSecurityAudit(request, session, 'page_revision_restored', `page:${pageId}`, { revisionId });
    return NextResponse.json({ page: restored });
  } catch (error) { return apiError(error); }
}
