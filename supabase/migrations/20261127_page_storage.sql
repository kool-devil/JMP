begin;

create or replace function public.coretax_insert_page(p_page jsonb, p_actor text)
returns public.cms_pages
language plpgsql set search_path = public, pg_temp as $$
declare
  created public.cms_pages;
  page_id bigint;
  written_at timestamptz := clock_timestamp();
begin
  -- Existing content imports supply their own IDs. Allocate under a write lock.
  lock table public.cms_pages in share row exclusive mode;
  select coalesce(max(id), 0) + 1 into page_id from public.cms_pages;
  insert into public.cms_pages (id, slug, status, order_num, data, created_at, updated_at)
  values (
    page_id, p_page->>'slug', p_page->>'status', coalesce(nullif(p_page->>'order','')::integer, 99),
    p_page || jsonb_build_object('id', page_id, 'createdAt', written_at, 'updatedAt', written_at, 'updatedBy', p_actor),
    written_at, written_at
  ) returning * into created;
  return created;
end;
$$;

create or replace function public.coretax_update_page(p_id bigint, p_expected timestamptz, p_page jsonb, p_actor text)
returns public.cms_pages
language plpgsql set search_path = public, pg_temp as $$
declare
  previous public.cms_pages;
  saved public.cms_pages;
  written_at timestamptz;
  previous_data jsonb;
  page_slug text;
begin
  select * into previous from public.cms_pages where id = p_id for update;
  if not found then raise exception 'Page not found.' using errcode = 'P0002'; end if;
  if previous.updated_at is distinct from p_expected then
    raise exception 'Page changed.' using errcode = '40001';
  end if;
  written_at := greatest(clock_timestamp(), previous.updated_at + interval '1 millisecond');
  page_slug := case when previous.slug = 'home' then 'home' else p_page->>'slug' end;
  previous_data := previous.data || jsonb_build_object(
    'id', previous.id, 'slug', previous.slug, 'status', previous.status, 'order', previous.order_num,
    'createdAt', coalesce(nullif(previous.data->>'createdAt', ''), previous.created_at::text), 'updatedAt', previous.updated_at
  );
  insert into public.cms_revisions (id, page_id, snapshot, created_at, created_by)
  values (gen_random_uuid()::text, p_id, jsonb_build_object('page', previous_data), written_at, p_actor);

  update public.cms_pages set
    slug = page_slug,
    status = p_page->>'status',
    order_num = coalesce(nullif(p_page->>'order','')::integer, 99),
    data = p_page || jsonb_build_object('id', p_id, 'slug', page_slug, 'createdAt', previous_data->'createdAt', 'updatedAt', written_at, 'updatedBy', p_actor),
    updated_at = written_at
  where id = p_id returning * into saved;

  delete from public.cms_revisions where id in (
    select id from public.cms_revisions where page_id = p_id order by created_at desc, id desc offset 30
  );
  return saved;
end;
$$;

create or replace function public.coretax_delete_page(p_id bigint, p_expected timestamptz)
returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  delete from public.cms_pages where id = p_id and updated_at = p_expected and slug <> 'home';
  if not found then raise exception 'Page changed.' using errcode = '40001'; end if;
  delete from public.cms_revisions where page_id = p_id;
end;
$$;

revoke all on function public.coretax_insert_page(jsonb, text) from public, anon, authenticated;
revoke all on function public.coretax_update_page(bigint, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function public.coretax_delete_page(bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.coretax_insert_page(jsonb, text) to service_role;
grant execute on function public.coretax_update_page(bigint, timestamptz, jsonb, text) to service_role;
grant execute on function public.coretax_delete_page(bigint, timestamptz) to service_role;
notify pgrst, 'reload schema';

commit;
