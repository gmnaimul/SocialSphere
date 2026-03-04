create or replace view public.friend_feed_posts as
select
  ff.viewer_id,
  po.id,
  po.type,
  po.content,
  po.media_url,
  po.created_at,
  pr.id as author_id,
  pr.full_name as author_name,
  pr.avatar_url as author_avatar,
  count(distinct r.id) filter (where r.type = 'love')::int as love_count,
  count(distinct r.id) filter (where r.type = 'hate')::int as hate_count,
  count(distinct c.id)::int as comment_count,
  max(case when r.user_id = ff.viewer_id then r.type end) as my_reaction
from public.friend_feed ff
join public.posts po on po.id = ff.id
join public.profiles pr on pr.id = po.user_id
left join public.reactions r on r.post_id = po.id
left join public.comments c on c.post_id = po.id
group by ff.viewer_id, po.id, pr.id;

alter view public.friend_feed_posts set (security_invoker = true);