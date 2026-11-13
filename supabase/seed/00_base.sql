-- 00_base.sql (dibuat oleh scripts/gen_seed.py) — idempoten
begin;
insert into branches(code,name,city,is_demo,data_origin) values ('CDL','Cidodol','Jakarta',false,'real') on conflict (code) do nothing;
insert into branches(code,name,city,is_demo,data_origin) values ('CLD','Ciledug','Tangerang',true,'demo') on conflict (code) do nothing;
insert into branches(code,name,city,is_demo,data_origin) values ('MRY','Meruya','Jakarta Barat',true,'demo') on conflict (code) do nothing;
insert into branches(code,name,city,is_demo,data_origin) values ('PMG','Pamulang','Tangerang Selatan',true,'demo') on conflict (code) do nothing;
insert into branches(code,name,city,is_demo,data_origin) values ('CSK','Cisauk','Tangerang',true,'demo') on conflict (code) do nothing;
insert into branches(code,name,city,is_demo,data_origin) values ('BTR','Bintaro','Tangerang Selatan',true,'demo') on conflict (code) do nothing;
insert into categories(name,default_tracking) values ('Laptop','serialized') on conflict (name) do nothing;
insert into categories(name,default_tracking) values ('PC All-in-One','serialized') on conflict (name) do nothing;
insert into categories(name,default_tracking) values ('Aksesori','quantity') on conflict (name) do nothing;
insert into app_settings(key,value) values ('max_discount_percent','0'::jsonb) on conflict (key) do nothing;
insert into app_settings(key,value) values ('store_warranty_months','null'::jsonb) on conflict (key) do nothing;
insert into app_settings(key,value) values ('payment_methods','["Tunai","Non Tunai"]'::jsonb) on conflict (key) do nothing;
insert into app_settings(key,value) values ('company_name','"Adrian Laptop Store"'::jsonb) on conflict (key) do nothing;
commit;
