create extension if not exists pgcrypto;

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('upload', 'url')),
  original_name text not null,
  url text,
  file_path text,
  duration double precision not null default 0,
  status text not null default 'queued' check (status in ('queued', 'downloading', 'processing', 'analyzing', 'summarizing', 'done', 'failed')),
  error_message text,
  target_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  
);

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null unique references public.videos(id) on delete cascade,
  language text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  position integer not null,
  start_time double precision not null,
  end_time double precision not null,
  speaker text not null default '',
  language text not null,
  text text not null,
  confidence double precision not null default 0
);

create table if not exists public.graphs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null unique references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.graph_nodes (
  id uuid primary key default gen_random_uuid(),
  graph_id uuid not null references public.graphs(id) on delete cascade,
  node_id text not null,
  label text not null,
  type text not null,
  timestamp_ref double precision,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.graph_edges (
  id uuid primary key default gen_random_uuid(),
  graph_id uuid not null references public.graphs(id) on delete cascade,
  source_id text not null,
  target_id text not null,
  relation text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_content (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  type text not null check (type in ('summary', 'notes', 'quiz')),
  content text not null,
  format text not null default 'markdown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(video_id, type)
);

-- Semantic chapter auto-segmentation: the processing service splits the
-- transcript into topic-boundary chapters; this table stores them so the
-- frontend can render a chapter rail + seek straight to each section.
create table if not exists public.video_chapters (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  chapter_index integer not null,
  title text not null,
  start_time double precision not null,
  end_time double precision not null,
  summary text not null default '',
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(video_id, chapter_index)
);

create index if not exists videos_owner_created_idx on public.videos(owner_id, created_at desc);
create index if not exists transcript_segments_lookup_idx on public.transcript_segments(transcript_id, position);
create index if not exists graph_nodes_lookup_idx on public.graph_nodes(graph_id);
create index if not exists graph_edges_lookup_idx on public.graph_edges(graph_id);
create index if not exists video_chapters_lookup_idx on public.video_chapters(video_id, chapter_index);

alter table public.videos enable row level security;
alter table public.transcripts enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.graphs enable row level security;
alter table public.graph_nodes enable row level security;
alter table public.graph_edges enable row level security;
alter table public.generated_content enable row level security;
alter table public.video_chapters enable row level security;

create policy "Users manage their videos" on public.videos for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users read their transcripts" on public.transcripts for select using (exists (select 1 from public.videos where videos.id = transcripts.video_id and videos.owner_id = auth.uid()));
create policy "Users read their transcript segments" on public.transcript_segments for select using (exists (select 1 from public.transcripts join public.videos on videos.id = transcripts.video_id where transcripts.id = transcript_segments.transcript_id and videos.owner_id = auth.uid()));
create policy "Users read their graphs" on public.graphs for select using (exists (select 1 from public.videos where videos.id = graphs.video_id and videos.owner_id = auth.uid()));
create policy "Users read their graph nodes" on public.graph_nodes for select using (exists (select 1 from public.graphs join public.videos on videos.id = graphs.video_id where graphs.id = graph_nodes.graph_id and videos.owner_id = auth.uid()));
create policy "Users read their graph edges" on public.graph_edges for select using (exists (select 1 from public.graphs join public.videos on videos.id = graphs.video_id where graphs.id = graph_edges.graph_id and videos.owner_id = auth.uid()));
create policy "Users manage their generated content" on public.generated_content for all using (exists (select 1 from public.videos where videos.id = generated_content.video_id and videos.owner_id = auth.uid())) with check (exists (select 1 from public.videos where videos.id = generated_content.video_id and videos.owner_id = auth.uid()));
create policy "Users read their video chapters" on public.video_chapters for select using (exists (select 1 from public.videos where videos.id = video_chapters.video_id and videos.owner_id = auth.uid()));
