-- PowerTest PWA - migración para sincronización automática
-- Ejecutar en Supabase SQL Editor antes de activar GitHub Actions.

-- Añadir identificador externo del intento de PowerTest para evitar duplicados.
alter table public.tests
  add column if not exists external_attempt_id text;

alter table public.tests
  add column if not exists tipo text;

alter table public.tests
  add column if not exists tiempo text;

alter table public.tests
  add column if not exists estado text;

alter table public.tests
  add column if not exists tema_principal text;

create unique index if not exists idx_tests_user_external_attempt
  on public.tests(user_id, external_attempt_id);

-- Añadir identificador externo de pregunta/fallo para evitar duplicados.
alter table public.fallos
  add column if not exists external_attempt_id text;

alter table public.fallos
  add column if not exists external_question_id text;

create unique index if not exists idx_fallos_user_external_question
  on public.fallos(user_id, external_attempt_id, external_question_id)
  where external_attempt_id is not null and external_question_id is not null;

-- Estado ampliado para sincronizaciones.
alter table public.sincronizaciones
  add column if not exists started_at timestamptz;

alter table public.sincronizaciones
  add column if not exists finished_at timestamptz;

alter table public.sincronizaciones
  add column if not exists token_valid boolean;

alter table public.sincronizaciones
  add column if not exists github_run_id text;

-- Vista de resumen general para la PWA.
create or replace view public.v_resumen_general
with (security_invoker = true) as
select
  user_id,
  count(*)::int as total_tests,
  coalesce(sum(aciertos), 0)::int as total_aciertos,
  coalesce(sum(fallos), 0)::int as total_fallos,
  coalesce(sum(no_respondidas), 0)::int as total_no_respondidas,
  coalesce(sum(total_preguntas), 0)::int as total_preguntas,
  round(avg(porcentaje)::numeric, 2) as media_porcentaje,
  max(fecha) as ultimo_test
from public.tests
group by user_id;

-- Vista de tests a repetir.
create or replace view public.v_tests_a_repetir
with (security_invoker = true) as
select
  id,
  user_id,
  fecha,
  nombre,
  porcentaje,
  total_preguntas,
  aciertos,
  fallos,
  no_respondidas,
  coalesce(fallos, 0) + coalesce(no_respondidas, 0) as problemas
from public.tests
where coalesce(fallos, 0) + coalesce(no_respondidas, 0) > 0
order by problemas desc, porcentaje asc nulls first, fecha desc;
