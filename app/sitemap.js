import { getSettings, listPages } from './lib/public-store';
import { isIndexablePage, pagePath, siteOrigin } from './lib/seo.mjs';
export const dynamic = 'force-dynamic';
export default async function sitemap() {
  const [settings, pages] = await Promise.all([getSettings(), listPages()]);
  const origin = siteOrigin(settings, process.env);
  if (!origin) return [];
  return [...pages.filter(isIndexablePage).map(page => ({ url:origin+pagePath(page), lastModified:page.updatedAt || page.createdAt || undefined })), {url:origin+'/blog'}];
}
