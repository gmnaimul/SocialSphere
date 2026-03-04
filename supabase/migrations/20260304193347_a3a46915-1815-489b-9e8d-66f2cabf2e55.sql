-- Secure social feed views and tighten post visibility

CREATE OR REPLACE VIEW public.accepted_friends
WITH (security_invoker=on) AS
SELECT f.requester_id AS viewer_id,
       f.addressee_id AS friend_id
FROM public.friendships f
WHERE f.status = 'accepted'
UNION ALL
SELECT f.addressee_id AS viewer_id,
       f.requester_id AS friend_id
FROM public.friendships f
WHERE f.status = 'accepted';

CREATE OR REPLACE VIEW public.friend_feed
WITH (security_invoker=on) AS
SELECT af.viewer_id,
       p.id
FROM public.accepted_friends af
JOIN public.posts p ON p.user_id = af.friend_id;

CREATE OR REPLACE VIEW public.friend_feed_posts
WITH (security_invoker=on) AS
SELECT ff.viewer_id,
       po.id,
       po.type,
       po.content,
       po.media_url,
       po.created_at,
       pr.id AS author_id,
       pr.full_name AS author_name,
       pr.avatar_url AS author_avatar,
       (COUNT(DISTINCT r.id) FILTER (WHERE r.type = 'love'))::integer AS love_count,
       (COUNT(DISTINCT r.id) FILTER (WHERE r.type = 'hate'))::integer AS hate_count,
       (COUNT(DISTINCT c.id))::integer AS comment_count,
       MAX(CASE WHEN r.user_id = ff.viewer_id THEN r.type ELSE NULL::text END) AS my_reaction
FROM public.friend_feed ff
JOIN public.posts po ON po.id = ff.id
JOIN public.profiles pr ON pr.id = po.user_id
LEFT JOIN public.reactions r ON r.post_id = po.id
LEFT JOIN public.comments c ON c.post_id = po.id
GROUP BY ff.viewer_id, po.id, pr.id;

DROP POLICY IF EXISTS "Authenticated can read posts" ON public.posts;

CREATE POLICY "Users can read own and accepted friends posts"
ON public.posts
FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.requester_id = auth.uid() AND f.addressee_id = posts.user_id)
        OR (f.addressee_id = auth.uid() AND f.requester_id = posts.user_id)
      )
  )
);