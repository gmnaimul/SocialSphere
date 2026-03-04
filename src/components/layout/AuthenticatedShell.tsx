import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Home,
  LogOut,
  MessageCircle,
  Search,
  Settings,
  User,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

const navItems = [
  { label: "Home", path: "/feed", icon: Home },
  { label: "Profile", path: "/profile/me", icon: User },
  { label: "Search", path: "/search", icon: Search },
  { label: "Chat", path: "/chat", icon: MessageCircle },
  { label: "Settings", path: "/settings", icon: Settings },
] as const;

type PendingFriendRequest = {
  id: string;
  requester_id: string;
  created_at: string;
};

type InteractionEvent = {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
  type?: string;
};

type ProfileMini = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type NavbarNotification = {
  id: string;
  category: "friend_request" | "comment" | "reaction";
  created_at: string;
  actor_name: string;
  actor_avatar: string | null;
  text: string;
  friendship_id?: string;
  post_id?: string;
};

const getInitials = (name?: string | null) => {
  if (!name) return "SS";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

const AuthenticatedShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, profile, loading, signOut } = useAuth();

  const userId = user?.id;
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Record<string, true>>({});

  const { data: myPostIds = [] } = useQuery<string[]>({
    queryKey: ["navbar-my-post-ids", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("posts").select("id").eq("user_id", userId).limit(1000);
      if (error) throw error;
      return (((data as Array<{ id: string }> | null) ?? []).map((row) => row.id));
    },
  });

  const { data: notifications = [], refetch: refetchNotifications } = useQuery<NavbarNotification[]>({
    queryKey: ["navbar-notifications", userId, myPostIds.join(",")],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [friendReqRes, reactionsRes, commentsRes] = await Promise.all([
        (supabase as any)
          .from("friendships")
          .select("id, requester_id, created_at")
          .eq("addressee_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(20),
        myPostIds.length
          ? (supabase as any)
              .from("reactions")
              .select("id, post_id, user_id, type, created_at")
              .in("post_id", myPostIds)
              .neq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [], error: null }),
        myPostIds.length
          ? (supabase as any)
              .from("comments")
              .select("id, post_id, user_id, created_at")
              .in("post_id", myPostIds)
              .neq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (friendReqRes.error) throw friendReqRes.error;
      if (reactionsRes.error) throw reactionsRes.error;
      if (commentsRes.error) throw commentsRes.error;

      const friendReqs = (friendReqRes.data as PendingFriendRequest[] | null) ?? [];
      const reactions = (reactionsRes.data as InteractionEvent[] | null) ?? [];
      const comments = (commentsRes.data as InteractionEvent[] | null) ?? [];

      const actorIds = Array.from(
        new Set<string>([
          ...friendReqs.map((row) => row.requester_id),
          ...reactions.map((row) => row.user_id),
          ...comments.map((row) => row.user_id),
        ]),
      );

      const actorMap = new Map<string, ProfileMini>();
      if (actorIds.length > 0) {
        const { data: actors, error: actorsError } = await (supabase as any)
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", actorIds);
        if (actorsError) throw actorsError;
        (((actors as ProfileMini[] | null) ?? [])).forEach((actor) => actorMap.set(actor.id, actor));
      }

      const friendNotifications: NavbarNotification[] = friendReqs.map((row) => {
        const actor = actorMap.get(row.requester_id);
        const actorName = actor?.full_name || "Someone";
        return {
          id: `friend-${row.id}`,
          category: "friend_request",
          created_at: row.created_at,
          actor_name: actorName,
          actor_avatar: actor?.avatar_url ?? null,
          text: `${actorName} sent you a friend request`,
          friendship_id: row.id,
        };
      });

      const reactionNotifications: NavbarNotification[] = reactions.map((row) => {
        const actor = actorMap.get(row.user_id);
        const actorName = actor?.full_name || "Someone";
        const reactionType = row.type === "hate" ? "reacted with hate" : "reacted with love";
        return {
          id: `reaction-${row.id}`,
          category: "reaction",
          created_at: row.created_at,
          actor_name: actorName,
          actor_avatar: actor?.avatar_url ?? null,
          text: `${actorName} ${reactionType} on your post`,
          post_id: row.post_id,
        };
      });

      const commentNotifications: NavbarNotification[] = comments.map((row) => {
        const actor = actorMap.get(row.user_id);
        const actorName = actor?.full_name || "Someone";
        return {
          id: `comment-${row.id}`,
          category: "comment",
          created_at: row.created_at,
          actor_name: actorName,
          actor_avatar: actor?.avatar_url ?? null,
          text: `${actorName} commented on your post`,
          post_id: row.post_id,
        };
      });

      return [...friendNotifications, ...reactionNotifications, ...commentNotifications]
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
        .slice(0, 20);
    },
  });

  const visibleNotifications = useMemo(
    () => notifications.filter((item) => !dismissedNotificationIds[item.id]),
    [dismissedNotificationIds, notifications],
  );

  const acceptFriendRequestMutation = useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await (supabase as any).from("friendships").update({ status: "accepted" }).eq("id", friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["navbar-notifications", userId] });
      void queryClient.invalidateQueries({ queryKey: ["feed-suggestions", userId] });
      void queryClient.invalidateQueries({ queryKey: ["profile-page-suggestions", userId, true] });
    },
  });

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["unread-messages-count", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("messages")
        .select("id", { head: true, count: "exact" })
        .eq("receiver_id", userId)
        .eq("is_read", false);

      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!userId) return;

    const syncUnreadCount = async () => {
      const { count } = await supabase
        .from("messages")
        .select("id", { head: true, count: "exact" })
        .eq("receiver_id", userId)
        .eq("is_read", false);

      queryClient.setQueryData(["unread-messages-count", userId], count ?? 0);
    };

    const channel = supabase
      .channel(`messages-unread-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${userId}`,
        },
        () => {
          void syncUnreadCount();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${userId}`,
        },
        () => {
          void syncUnreadCount();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  useEffect(() => {
    if (!userId) return;

    const myPosts = new Set(myPostIds);
    const channel = supabase
      .channel(`navbar-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "friendships",
          filter: `addressee_id=eq.${userId}`,
        },
        () => {
          void refetchNotifications();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "friendships",
          filter: `addressee_id=eq.${userId}`,
        },
        () => {
          void refetchNotifications();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
        },
        (payload: any) => {
          const next = payload.new as { post_id: string; user_id: string };
          if (myPosts.has(next.post_id) && next.user_id !== userId) {
            void refetchNotifications();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reactions",
        },
        (payload: any) => {
          const next = payload.new as { post_id: string; user_id: string };
          if (myPosts.has(next.post_id) && next.user_id !== userId) {
            void refetchNotifications();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myPostIds, refetchNotifications, userId]);

  useEffect(() => {
    if (notificationsOpen) void refetchNotifications();
  }, [notificationsOpen, refetchNotifications]);

  const profileName = profile?.full_name || user?.email || "User";
  const profilePath = userId ? `/profile/${userId}` : "/feed";

  const resolvedNavItems = useMemo(
    () => navItems.map((item) => (item.path === "/profile/me" ? { ...item, path: profilePath } : item)),
    [profilePath],
  );

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-screen-2xl items-center gap-3 px-4">
          <Link to="/feed" className="flex items-center gap-2">
            <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-primary-foreground">
              S
            </span>
            <span className="hidden text-sm font-semibold sm:inline">SocialSphere</span>
          </Link>

          <div className="relative mx-auto w-full max-w-[400px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search for people..."
              className="h-10 rounded-full border-border pl-10 focus-visible:border-primary focus-visible:ring-primary/40"
            />
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "relative rounded-full transition-all duration-150",
                location.pathname.startsWith("/chat") && "bg-primary/15 text-primary",
              )}
              onClick={() => navigate("/chat")}
              aria-label="Chat"
            >
              <MessageCircle className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1.5 text-center text-[10px] font-semibold leading-5 text-destructive-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>

            <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-full transition-all duration-150" aria-label="Notifications">
                  <Bell className="h-5 w-5" />
                  {visibleNotifications.length > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1.5 text-center text-[10px] font-semibold leading-5 text-destructive-foreground">
                      {visibleNotifications.length > 99 ? "99+" : visibleNotifications.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[340px] rounded-xl p-0">
                <div className="border-b border-border px-3 py-2">
                  <p className="text-sm font-semibold">Notifications</p>
                </div>
                <div className="max-h-[360px] overflow-y-auto p-1">
                  {visibleNotifications.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">No new notifications.</div>
                  ) : (
                    visibleNotifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full rounded-lg px-2 py-2 text-left hover:bg-accent"
                        onClick={() => {
                          setDismissedNotificationIds((prev) => ({ ...prev, [item.id]: true }));
                          if (item.post_id) {
                            navigate(`/feed?post=${item.post_id}`);
                            setNotificationsOpen(false);
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <Avatar className="mt-0.5 h-8 w-8">
                            <AvatarImage src={item.actor_avatar ?? ""} alt={item.actor_name} />
                            <AvatarFallback>{getInitials(item.actor_name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-snug">{item.text}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                            {item.category === "friend_request" && item.friendship_id ? (
                              <Button
                                size="sm"
                                className="mt-2 rounded-full"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDismissedNotificationIds((prev) => ({ ...prev, [item.id]: true }));
                                  acceptFriendRequestMutation.mutate(item.friendship_id!);
                                }}
                                disabled={acceptFriendRequestMutation.isPending}
                              >
                                Accept
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="Open user menu" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-10 w-10 border border-border">
                    <AvatarImage src={profile?.avatar_url ?? ""} alt={profileName} />
                    <AvatarFallback>{getInitials(profileName)}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-xl">
                <DropdownMenuItem onSelect={() => navigate(profilePath)}>View Profile</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/settings")}>Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await signOut();
                    navigate("/auth");
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-screen-2xl gap-6 px-4 pb-24 pt-20">
        <aside className="sticky top-20 hidden h-[calc(100dvh-6rem)] w-60 space-y-4 md:block">
          <div className="rounded-2xl border border-border bg-card/80 p-3 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 border border-border">
                <AvatarImage src={profile?.avatar_url ?? ""} alt={profileName} />
                <AvatarFallback>{getInitials(profileName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{profileName}</p>
                <button onClick={() => navigate(profilePath)} className="text-xs text-primary hover:underline">
                  View Profile
                </button>
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            {resolvedNavItems.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={label}
                to={path}
                className="flex items-center gap-3 rounded-full px-3 py-2 text-sm text-muted-foreground transition-all duration-150 hover:bg-accent"
                activeClassName="bg-primary/15 text-primary"
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-h-[calc(100dvh-7rem)] flex-1">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/80 px-2 py-2 backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5 gap-1">
          {resolvedNavItems.map(({ label, path, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <NavLink
                key={`mobile-${label}`}
                to={path}
                className="relative flex h-11 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 hover:bg-accent"
                activeClassName="bg-primary/15 text-primary"
                aria-label={label}
              >
                <Icon className={cn("h-5 w-5", isActive && "fill-current")} />
                {label === "Chat" && unreadCount > 0 && (
                  <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-destructive" />
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default AuthenticatedShell;
