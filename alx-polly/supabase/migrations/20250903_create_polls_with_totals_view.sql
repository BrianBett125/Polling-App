-- Create a view that aggregates total votes per poll
create or replace view public.polls_with_totals as
select 
  p.id,
  p.title,
  p.created_by,
  p.created_at,
  coalesce(sum(o.votes), 0)::int as total_votes
from public.polls p
left join public.poll_options o
  on o.poll_id = p.id
group by p.id, p.title, p.created_by, p.created_at;

-- Optional: Comment for clarity
comment on view public.polls_with_totals is 'Aggregated totals for polls with total_votes precomputed for efficient listing.';