import {unstable_cache} from 'next/cache';
import {cache} from 'react';
import {getSettings as freshSettings,getMenus as freshMenus,getPages as freshPages,getPageSummaries,findPageBySlug,readNavigationPages} from './store';
import {isPublicPage} from './publishing.mjs';
import {publicSettings} from './public-settings.mjs';
import {bookingAvailable} from './calendar-config.mjs';
import {withStarterArticles} from './starter-articles.mjs';
import {SERVICE_GUIDES} from './experience.mjs';
const cachedSettings=unstable_cache(freshSettings,['public-settings-v9'],{tags:['public-content'],revalidate:60});
const cachedMenus=unstable_cache(freshMenus,['public-menus-v9'],{tags:['public-content'],revalidate:60});
const cachedSummaries=unstable_cache(getPageSummaries,['public-page-summaries'],{tags:['public-content'],revalidate:60});
const cachedPage=unstable_cache(findPageBySlug,['public-page-by-slug'],{tags:['public-content'],revalidate:60});
const serviceSlugs=['our-services','other-services',...SERVICE_GUIDES.map(guide=>guide.slug)];
const loadServicePages=()=>readNavigationPages(serviceSlugs);
const cachedServicePages=unstable_cache(loadServicePages,['public-service-navigation'],{tags:['public-content'],revalidate:60});
const production=()=>process.env.NODE_ENV==='production';
export const getSettings=cache(async()=>{
  const settings=await(production()?cachedSettings():freshSettings());
  return {...publicSettings(settings),bookingEnabled:bookingAvailable(settings)};
});
export const getMenus=cache(()=>production()?cachedMenus():freshMenus());
function publishedPages(records){
  return withStarterArticles(records).filter(page=>isPublicPage(page)).sort((a,b)=>(a.order||99)-(b.order||99));
}
export const listPages=cache(async()=>publishedPages(await (production()?cachedSummaries():getPageSummaries())));
export const listSearchPages=cache(async()=>publishedPages(await freshPages()));
export const listServicePages=cache(async()=> (await (production()?cachedServicePages():loadServicePages())).filter(page=>isPublicPage(page)));
export const getPageBySlug=cache(async slug=>{
  const value=String(slug||'home').replace(/^\/+|\/+$/g,'')||'home';
  const stored=await (production()?cachedPage(value):findPageBySlug(value));
  if (stored) return isPublicPage(stored)?stored:null;
  return withStarterArticles([]).find(page=>page.slug===value)||null;
});
