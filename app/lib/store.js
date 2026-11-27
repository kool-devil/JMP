import crypto from 'crypto';
import { cache } from 'react';
import { isPublicPage } from './publishing.mjs';
import fs from 'fs/promises';
import path from 'path';
import { supabaseAdmin, getSupabaseStatus } from './supabase';
import { localMutate } from './runtime-store';
import { invalidatePublicContent } from './public-cache';

const localFile = path.join(process.cwd(), 'data', 'local-store.json');
const seedFile = path.join(process.cwd(), 'data', 'seed.json');

function isProduction() { return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL); }
function normalizeData(data = {}) {
  return {
    settings: data.settings || {}, menus: data.menus || { header: [], footer: [] }, pages: Array.isArray(data.pages) ? data.pages : [],
    enquiries: Array.isArray(data.enquiries) ? data.enquiries : [], media: Array.isArray(data.media) ? data.media : [],
    revisions: data.revisions && typeof data.revisions === 'object' ? data.revisions : {}, jobs: data.jobs || [], bookings: data.bookings || [], updatedAt: data.updatedAt || null
  };
}
async function getSeed() { return normalizeData(JSON.parse(await fs.readFile(seedFile, 'utf8'))); }
async function readLocal() { try { return normalizeData(JSON.parse(await fs.readFile(localFile, 'utf8'))); } catch { return getSeed(); } }
async function writeLocal(data) { await fs.mkdir(path.dirname(localFile), { recursive: true }); await fs.writeFile(localFile, JSON.stringify(normalizeData(data), null, 2), 'utf8'); }

const ensureSeed = cache(async () => {
  const db = supabaseAdmin();
  if (!db) return;
  const { data, error } = await db.from('cms_pages').select('id').limit(1);
  if (error) throw error;
  if (data?.length) return;
  const seed = await getSeed();
  const pageRows = seed.pages.map((page) => ({ id: Number(page.id), slug: page.slug, status: page.status || 'draft', order_num: Number(page.order || 99), data: page, created_at: page.createdAt || new Date().toISOString(), updated_at: page.updatedAt || new Date().toISOString() }));
  const enquiryRows = seed.enquiries.map((item) => ({ id: Number(item.id), data: item, created_at: item.createdAt || new Date().toISOString() }));
  const mediaRows = seed.media.map((item) => ({ id: Number(item.id), data: item, created_at: item.createdAt || new Date().toISOString() }));
  await Promise.all([
    db.from('cms_settings').upsert({ id: 1, data: seed.settings, updated_at: new Date().toISOString() }),
    db.from('cms_menus').upsert({ id: 1, data: seed.menus, updated_at: new Date().toISOString() }),
    pageRows.length ? db.from('cms_pages').upsert(pageRows) : Promise.resolve(),
    enquiryRows.length ? db.from('cms_enquiries').upsert(enquiryRows) : Promise.resolve(),
    mediaRows.length ? db.from('cms_media').upsert(mediaRows) : Promise.resolve()
  ]);
});

const pageColumns = 'id,data,slug,status,order_num,created_at,updated_at';
const pageSummaryColumns = [
  'id', 'slug', 'status', 'order_num', 'created_at', 'updated_at',
  ...['title', 'template', 'publishAt', 'noIndex', 'seoTitle', 'metaDescription', 'heroText',
    'heroImage', 'heroImageAlt', 'heroFocalPoint', 'blogAuthor', 'blogCategory', 'blogDate', 'blogTags',
    'showInMenu', 'menuLabel', 'updatedBy'].map(key => `${key}:data->${key}`)
].join(',');

function pageFromRow({data, id, slug, status, order_num, created_at, updated_at, ...fields}) {
  return {...fields, ...data, id:Number(id), slug, status, order:order_num, createdAt:data?.createdAt || created_at, updatedAt:updated_at};
}

async function readPages({columns = pageColumns, key, value, slugs} = {}) {
  const db = supabaseAdmin();
  if (!db) {
    const store = isProduction() ? await getSeed() : await readLocal();
    if (key) return store.pages.find(page => page[key] === value) || null;
    return slugs ? store.pages.filter(page => slugs.includes(page.slug)) : store.pages;
  }
  await ensureSeed();
  if (key) {
    const {data,error} = await db.from('cms_pages').select(columns).eq(key,value).maybeSingle();
    if (error) throw error;
    return data ? pageFromRow(data) : null;
  }
  if (slugs) {
    const {data,error} = await db.from('cms_pages').select(columns).in('slug',slugs);
    if (error) throw error;
    return (data || []).map(pageFromRow);
  }
  const pages = [];
  const batchSize = 250;
  let cursor;
  for (;;) {
    const query = db.from('cms_pages').select(columns).order('id').limit(batchSize);
    if (cursor !== undefined) query.gt('id',cursor);
    const {data,error} = await query;
    if (error) throw error;
    if (!data?.length) return pages;
    pages.push(...data.map(pageFromRow));
    cursor = data.at(-1).id;
  }
}

async function dbRead(name) {
  const db = supabaseAdmin();
  if (!db) return null;
  await ensureSeed();
  if (name === 'settings' || name === 'menus') {
    const table = name === 'settings' ? 'cms_settings' : 'cms_menus';
    const { data, error } = await db.from(table).select('data').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data?.data ?? (name === 'menus' ? { header: [], footer: [] } : {});
  }
  if (name === 'enquiries') {
    const rows=[];for(let offset=0;;offset+=1000){const {data,error}=await db.from('cms_enquiries').select('id,data,created_at,updated_at').order('id',{ascending:false}).range(offset,offset+999);if(error)throw error;rows.push(...(data||[]));if(!data||data.length<1000)break;}
    return rows.map(row=>({...row.data,id:Number(row.id),createdAt:row.data?.createdAt||row.created_at,updatedAt:row.updated_at}));
  }
  if (name === 'media') {
    const { data, error } = await db.from('cms_media').select('id,data,created_at,updated_at').order('id', { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => ({ ...(row.data || {}), id: Number(row.id), createdAt: row.data?.createdAt || row.created_at, updatedAt: row.updated_at || row.data?.updatedAt }));
  }
  if (name === 'revisions') {
    const { data, error } = await db.from('cms_revisions').select('id,page_id,snapshot,created_at,created_by').order('created_at', { ascending: false });
    if (error) throw error;
    const grouped = {};
    for (const row of data || []) {
      const key = String(row.page_id);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ id: row.id, ...(row.snapshot || {}), savedAt: row.snapshot?.savedAt || row.created_at, savedBy: row.snapshot?.savedBy || row.created_by || '' });
    }
    return grouped;
  }
  return null;
}

async function dbWrite(name, value) {
  const db = supabaseAdmin();
  if (!db) return null;
  await ensureSeed();
  const now = new Date().toISOString();
  if (name === 'settings' || name === 'menus') {
    const table = name === 'settings' ? 'cms_settings' : 'cms_menus';
    const { error } = await db.from(table).upsert({ id: 1, data: value, updated_at: now });
    if (error) throw error;
    return value;
  }
  if (name === 'pages') {
    const rows = (Array.isArray(value) ? value : []).map((page) => ({ id: Number(page.id), slug: page.slug, status: page.status || 'draft', order_num: Number(page.order || 99), data: page, created_at: page.createdAt || now, updated_at: page.updatedAt || now }));
    if (rows.length) { const { error } = await db.from('cms_pages').upsert(rows); if (error) throw error; }
    const keep = rows.map((r) => r.id);
    const { data: existing, error: readError } = await db.from('cms_pages').select('id');
    if (readError) throw readError;
    const remove = (existing || []).map((r) => Number(r.id)).filter((id) => !keep.includes(id));
    if (remove.length) { const { error } = await db.from('cms_pages').delete().in('id', remove); if (error) throw error; }
    return value;
  }
  if (name === 'enquiries' || name === 'media') {
    const table = name === 'enquiries' ? 'cms_enquiries' : 'cms_media';
    const list = Array.isArray(value) ? value : [];
    const rows = list.map((item) => ({ id: Number(item.id), data: item, created_at: item.createdAt || now, updated_at: item.updatedAt || now }));
    if (rows.length) { const { error } = await db.from(table).upsert(rows); if (error) throw error; }
    const keep = rows.map((r) => r.id);
    const { data: existing, error: readError } = await db.from(table).select('id');
    if (readError) throw readError;
    const remove = (existing || []).map((r) => Number(r.id)).filter((id) => !keep.includes(id));
    if (remove.length) { const { error } = await db.from(table).delete().in('id', remove); if (error) throw error; }
    return value;
  }
  if (name === 'revisions') {
    const grouped = value && typeof value === 'object' ? value : {};
    const rows = [];
    for (const [pageId, revisions] of Object.entries(grouped)) {
      for (const revision of Array.isArray(revisions) ? revisions : []) rows.push({ id: revision.id || crypto.randomUUID?.() || `${pageId}-${Date.now()}-${rows.length}`, page_id: Number(pageId), snapshot: revision, created_at: revision.savedAt || revision.createdAt || now, created_by: revision.savedBy || revision.createdBy || '' });
    }
    await db.from('cms_revisions').delete().gte('created_at', '1900-01-01T00:00:00Z');
    if (rows.length) { const { error } = await db.from('cms_revisions').insert(rows); if (error) throw error; }
    return value;
  }
  return value;
}

async function readCollection(name) {
  const dbValue = await dbRead(name);
  if (dbValue !== null) return dbValue;
  const data = isProduction() ? await getSeed() : await readLocal();
  return data[name];
}
async function writeCollection(name, value) {
  if (supabaseAdmin()) return dbWrite(name, value);
  if (!isProduction()) return localMutate('local-store.json',await getSeed(),data=>{data[name]=value;data.updatedAt=new Date().toISOString();return value;});
  throw Object.assign(new Error('Persistent storage is not configured. Connect Supabase, run the included SQL schema, and redeploy.'), { code: 'STORAGE_NOT_CONFIGURED', status: 503 });
}

export function getStorageStatus() {
  const status = getSupabaseStatus();
  return {
    persistent: status.configured,
    provider: status.configured ? 'supabase-postgres' : (isProduction() ? 'seed-read-only' : 'local-file'),
    schemaVersion: 6,
    message: status.configured ? 'Supabase PostgreSQL is connected.' : isProduction() ? 'Public pages use bundled seed content. Connect Supabase before using admin edits or enquiries.' : 'Using local development file storage.'
  };
}
export const getSettings = cache(async () => (await readCollection('settings')) || {});
export const getMenus = cache(async () => (await readCollection('menus')) || { header: [], footer: [] });
export const getPages = cache(async () => (await readPages()).sort((a,b) => a.order - b.order || a.id - b.id));
export const getPageSummaries = cache(() => readPages({columns:pageSummaryColumns}));
export const findPageBySlug = cache(slug => readPages({key:'slug',value:slug}));
export const findPageById = cache(id => Number.isSafeInteger(id) ? readPages({key:'id',value:id}) : null);
export const readNavigationPages = slugs => readPages({slugs});

function pageError(message, status) {
  return Object.assign(new Error(message), {status});
}

function checkPageWrite(error) {
  if (!error) return;
  if (error.code === '23505') throw pageError('A page with this slug already exists.',409);
  if (error.code === '40001') throw pageError('This page changed after you opened it. Reload it before saving.',409);
  if (error.code === 'P0002') throw pageError('Page not found.',404);
  if (['42883','PGRST202'].includes(error.code)) {
    throw Object.assign(new Error('Apply the JMP page storage migration before editing pages.'), {
      code:'STORAGE_NOT_CONFIGURED',status:503
    });
  }
  throw error;
}

async function mutateLocalPages(mutate) {
  if (isProduction()) throw Object.assign(new Error('Connect Supabase before editing pages.'), {code:'STORAGE_NOT_CONFIGURED',status:503});
  return localMutate('local-store.json',await getSeed(),store => {
    store.pages ||= [];
    store.revisions ||= {};
    return mutate(store);
  });
}

export async function insertPageRecord(page, actor) {
  const db = supabaseAdmin();
  let saved;
  if (db) {
    await ensureSeed();
    const {data,error} = await db.rpc('coretax_insert_page',{p_page:page,p_actor:actor});
    checkPageWrite(error);
    saved = pageFromRow(data);
  } else {
    saved = await mutateLocalPages(store => {
      if (store.pages.some(item => item.slug === page.slug)) throw pageError('A page with this slug already exists.',409);
      const timestamp = new Date().toISOString();
      const created = {...page,id:nextId(store.pages),createdAt:timestamp,updatedAt:timestamp,updatedBy:actor};
      store.pages.push(created);
      return created;
    });
  }
  invalidatePublicContent();
  return saved;
}

export async function updatePageRecord(page, expectedAt, actor) {
  const db = supabaseAdmin();
  let saved;
  if (db) {
    const {data,error} = await db.rpc('coretax_update_page',{p_id:page.id,p_expected:expectedAt,p_page:page,p_actor:actor});
    checkPageWrite(error);
    saved = pageFromRow(data);
  } else {
    saved = await mutateLocalPages(store => {
      const index = store.pages.findIndex(item => item.id === page.id);
      const previous = store.pages[index];
      if (!previous) throw pageError('Page not found.',404);
      if (previous.updatedAt !== expectedAt) throw pageError('This page changed after you opened it. Reload it before saving.',409);
      if (store.pages.some(item => item.id !== page.id && item.slug === page.slug)) throw pageError('A page with this slug already exists.',409);
      const timestamp = new Date(Math.max(Date.now(),(Date.parse(expectedAt) || 0)+1)).toISOString();
      const revision = {id:crypto.randomUUID(),savedAt:timestamp,savedBy:actor,page:previous};
      store.revisions[page.id] = [revision,...(store.revisions[page.id] || [])].slice(0,30);
      return store.pages[index] = {...page,createdAt:previous.createdAt,updatedAt:timestamp,updatedBy:actor};
    });
  }
  invalidatePublicContent();
  return saved;
}

export async function removePageRecord(page) {
  const db = supabaseAdmin();
  if (db) {
    const {error} = await db.rpc('coretax_delete_page',{p_id:page.id,p_expected:page.updatedAt});
    checkPageWrite(error);
  } else {
    await mutateLocalPages(store => {
      const index = store.pages.findIndex(item => item.id === page.id && item.updatedAt === page.updatedAt);
      if (index < 0) throw pageError('This page changed after you opened it. Reload it before deleting.',409);
      store.pages.splice(index,1);
      delete store.revisions[page.id];
    });
  }
  invalidatePublicContent();
}

export async function getPageRevisions(pageId) {
  if (!Number.isSafeInteger(pageId)) return [];
  const db = supabaseAdmin();
  if (!db) return (await readLocal()).revisions[pageId] || [];
  const {data,error} = await db.from('cms_revisions').select('id,snapshot,created_at,created_by').eq('page_id',pageId)
    .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(30);
  if (error) throw error;
  return (data || []).map(row => ({...row.snapshot,id:row.id,savedAt:row.snapshot?.savedAt || row.created_at,savedBy:row.snapshot?.savedBy || row.created_by || ''}));
}
export async function getEnquiries() { return (await readCollection('enquiries')) || []; }
export async function getMedia() { return (await readCollection('media')) || []; }
export async function getRevisions() { return (await readCollection('revisions')) || {}; }
export async function saveSettings(value) { const result = await writeCollection('settings', value || {}); invalidatePublicContent(); return result; }
export async function saveMenus(value) { const result = await writeCollection('menus', value || { header: [], footer: [] }); invalidatePublicContent(); return result; }
export async function savePages(value) { const result = await writeCollection('pages', Array.isArray(value) ? value : []); invalidatePublicContent(); return result; }
export async function saveEnquiries(value) { return writeCollection('enquiries', Array.isArray(value) ? value : []); }
export async function saveMedia(value) { return writeCollection('media', Array.isArray(value) ? value : []); }
export async function saveRevisions(value) { return writeCollection('revisions', value && typeof value === 'object' ? value : {}); }
export async function getData() { const [settings, menus, pages, enquiries, media, revisions] = await Promise.all([getSettings(), getMenus(), getPages(), getEnquiries(), getMedia(), getRevisions()]); return { settings, menus, pages, enquiries, media, revisions, updatedAt: new Date().toISOString(), schemaVersion: 6 }; }
export async function saveData(data) { const normalized = normalizeData(data); await Promise.all([saveSettings(normalized.settings), saveMenus(normalized.menus), savePages(normalized.pages), saveEnquiries(normalized.enquiries), saveMedia(normalized.media), saveRevisions(normalized.revisions)]); return { ...normalized, updatedAt: new Date().toISOString(), schemaVersion: 6 }; }
export async function replaceData(data) { return saveData(data); }
export async function listPages(includeDrafts = false) { const pages = await getPages(); return pages.filter((page) => includeDrafts || isPublicPage(page)).sort((a, b) => (a.order || 999) - (b.order || 999)); }
export async function getPageBySlug(slug, includeDrafts = false) { const pages = await listPages(includeDrafts); const cleanSlug = slug === '/' ? 'home' : String(slug || 'home').replace(/^\//, '').replace(/\/$/, '') || 'home'; return pages.find((page) => page.slug === cleanSlug) || null; }
export function nextId(items = []) { return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1; }
