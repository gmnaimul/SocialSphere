alter view public.accepted_friends set (security_invoker = true);
alter view public.friend_feed set (security_invoker = true);