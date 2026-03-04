import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ImagePlus, Loader2, MessageCircle, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { appToast } from "@/lib/app-toast";
import { PostCard } from "@/components/PostCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type ReactionType = "love" | "hate";

type FeedPost = {
  id: string;
  type: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
  author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  love_count: number;
  hate_count: number;
  comment_count: number;
  my_reaction: ReactionType | null;
};

type FeedPage = {
  rows: FeedPost[];
  nextPage: number | undefined;
};

type ProfileMini = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at?: string;
  is_online?: boolean;
};

const PAGE_SIZE = 20;

const getInitials = (name?: string | null) => {
  const clean = name?.trim();
  if (!clean) return "U";
  return clean
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

const getFirstName = (name?: string | null) => {
  const clean = name?.trim();
  if (!clean) return "there";
  return clean.split(" ")[0] ?? "there";
};

const FeedSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 4 }).map((_, idx) => (
      <div key={idx} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    ))}
  </div>
);

const Feed = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [composerFile, setComposerFile] = useState<File | null>(null);
  const [composerPreview, setComposerPreview] = useState<string | null>(null);
  const [autoOpenPicker, setAutoOpenPicker] = useState(false);
  const [sentRequests, setSentRequests] = useState<Record<string, boolean>>({});
  const [showBackToTop, setShowBackToTop] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { data: authUserId } = useQuery<string | null>({
    queryKey: ["auth-user-id"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
  });

  const { data: me } = useQuery<ProfileMini | null>({
    queryKey: ["feed-current-profile", authUserId],
    enabled: Boolean(authUserId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", authUserId)
        .maybeSingle();
      if (error) throw error;
      return (data as ProfileMini | null) ?? null;
    },
  });

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isError,
    refetch,
  } = useInfiniteQuery<FeedPage, Error, InfiniteData<FeedPage>, (string | null)[], number>({
    queryKey: ["feed-posts-v2", authUserId],
    enabled: Boolean(authUserId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam ?? 0);
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: rows, error } = await (supabase as any)
        .from("friend_feed_posts")
        .select(
          "id, type, content, media_url, created_at, author_id, author_name, author_avatar, love_count, hate_count, comment_count, my_reaction",
        )
        .eq("viewer_id", authUserId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      const safeRows = ((rows as FeedPost[] | null) ?? []).map((row) => ({
        ...row,
        love_count: Number(row.love_count ?? 0),
        hate_count: Number(row.hate_count ?? 0),
        comment_count: Number(row.comment_count ?? 0),
      }));

      return {
        rows: safeRows,
        nextPage: safeRows.length === PAGE_SIZE ? page + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const posts = useMemo(() => data?.pages.flatMap((page) => page.rows) ?? [], [data]);
  const targetPostId = searchParams.get("post");

  useEffect(() => {
    const onScroll = () => {
      if (!hasNextPage || isFetchingNextPage) {
        setShowBackToTop(window.scrollY > 800);
        return;
      }

      const offset = document.documentElement.scrollHeight - (window.innerHeight + window.scrollY);
      if (offset <= 300) void fetchNextPage();
      setShowBackToTop(window.scrollY > 800);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    if (!composerOpen || !autoOpenPicker) return;
    const timer = window.setTimeout(() => {
      uploadInputRef.current?.click();
      setAutoOpenPicker(false);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [autoOpenPicker, composerOpen]);

  useEffect(() => {
    if (!composerTextareaRef.current) return;
    composerTextareaRef.current.style.height = "auto";
    composerTextareaRef.current.style.height = `${Math.max(composerTextareaRef.current.scrollHeight, 80)}px`;
  }, [composerText, composerOpen]);

  useEffect(() => {
    if (!targetPostId || posts.length === 0) return;
    const exists = posts.some((post) => post.id === targetPostId);
    if (!exists) return;

    const node = document.getElementById(`feed-post-${targetPostId}`);
    if (!node) return;

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background", "rounded-2xl");

    const cleanupTimer = window.setTimeout(() => {
      node.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background", "rounded-2xl");
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("post");
        return next;
      }, { replace: true });
    }, 1800);

    return () => window.clearTimeout(cleanupTimer);
  }, [posts, setSearchParams, targetPostId]);

  useEffect(() => {
    return () => {
      if (composerPreview) URL.revokeObjectURL(composerPreview);
    };
  }, [composerPreview]);

  const resetComposer = () => {
    if (composerPreview) URL.revokeObjectURL(composerPreview);
    setComposerText("");
    setComposerFile(null);
    setComposerPreview(null);
    setAutoOpenPicker(false);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  const createPostMutation = useMutation({
    mutationFn: async () => {
      if (!authUserId) throw new Error("You need to be signed in to post.");

      const trimmed = composerText.trim();
      if (!trimmed && !composerFile) throw new Error("Add text or a photo first.");
      if (trimmed.length > 500) throw new Error("Status text must be 500 characters or less.");

      let mediaUrl: string | null = null;
      if (composerFile) {
        const uploadPath = `${authUserId}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await (supabase as any)
          .storage
          .from("post-media")
          .upload(uploadPath, composerFile, {
            upsert: false,
            contentType: composerFile.type || "image/jpeg",
          });

        if (uploadError) throw uploadError;
        const { data: publicData } = (supabase as any).storage.from("post-media").getPublicUrl(uploadPath);
        mediaUrl = publicData.publicUrl;
      }

      const payload = {
        user_id: authUserId,
        type: mediaUrl ? "photo" : "status",
        content: trimmed || null,
        media_url: mediaUrl,
      };

      const { data: inserted, error } = await (supabase as any)
        .from("posts")
        .insert(payload)
        .select("id, type, content, media_url, created_at")
        .single();

      if (error) throw error;

      return {
        ...(inserted as { id: string; type: string; content: string | null; media_url: string | null; created_at: string }),
        author_id: authUserId,
        author_name: me?.full_name ?? "You",
        author_avatar: me?.avatar_url ?? null,
        love_count: 0,
        hate_count: 0,
        comment_count: 0,
        my_reaction: null,
      } as FeedPost;
    },
    onSuccess: (newPost) => {
      queryClient.setQueryData<InfiniteData<FeedPage>>(["feed-posts-v2", authUserId], (prev) => {
        if (!prev) {
          return {
            pages: [{ rows: [newPost], nextPage: undefined }],
            pageParams: [0],
          };
        }

        const [firstPage, ...restPages] = prev.pages;
        return {
          ...prev,
          pages: [
            {
              ...firstPage,
              rows: [newPost, ...firstPage.rows],
            },
            ...restPages,
          ],
        };
      });

      setComposerOpen(false);
      resetComposer();
      appToast.postShared();
    },
    onError: (error: Error) => appToast.error(error),
  });

  const { data: suggestions = [] } = useQuery<ProfileMini[]>({
    queryKey: ["feed-suggestions", authUserId],
    enabled: Boolean(authUserId),
    queryFn: async () => {
      const [profilesRes, friendshipsRes] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select("id, full_name, avatar_url, created_at")
          .neq("id", authUserId)
          .order("created_at", { ascending: false })
          .limit(40),
        (supabase as any)
          .from("friendships")
          .select("requester_id, addressee_id")
          .or(`requester_id.eq.${authUserId},addressee_id.eq.${authUserId}`),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (friendshipsRes.error) throw friendshipsRes.error;

      const excluded = new Set<string>(
        (((friendshipsRes.data as Array<{ requester_id: string; addressee_id: string }> | null) ?? [])
          .map((row) => (row.requester_id === authUserId ? row.addressee_id : row.requester_id))
          .filter(Boolean)),
      );

      return (((profilesRes.data as ProfileMini[] | null) ?? [])
        .filter((profile) => !excluded.has(profile.id))
        .slice(0, 10));
    },
  });

  const addFriendMutation = useMutation({
    mutationFn: async (targetId: string) => {
      if (!authUserId) throw new Error("You need to sign in first.");
      const { error } = await (supabase as any).from("friendships").insert({
        requester_id: authUserId,
        addressee_id: targetId,
        status: "pending",
      });
      if (error) throw error;
      return targetId;
    },
    onSuccess: (targetId: string) => {
      setSentRequests((prev) => ({ ...prev, [targetId]: true }));
      appToast.friendRequestSent();
    },
    onError: (error: Error) => appToast.error(error),
  });

  const acceptFriendRequestMutation = useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await (supabase as any)
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      appToast.friendRequestAccepted();
      void queryClient.invalidateQueries({ queryKey: ["feed-suggestions", authUserId] });
      void queryClient.invalidateQueries({ queryKey: ["feed-online-friends", authUserId] });
    },
    onError: (error: Error) => appToast.error(error),
  });

  const { data: acceptedFriendIds = [] } = useQuery<string[]>({
    queryKey: ["feed-accepted-friend-ids", authUserId],
    enabled: Boolean(authUserId),
    queryFn: async () => {
      const { data: acceptedRows, error: acceptedError } = await (supabase as any)
        .from("accepted_friends")
        .select("friend_id")
        .eq("viewer_id", authUserId);

      if (acceptedError) throw acceptedError;

      return Array.from(
        new Set(((acceptedRows as Array<{ friend_id: string }> | null) ?? []).map((row) => row.friend_id)),
      );
    },
  });

  const { data: onlineFriends = [] } = useQuery<ProfileMini[]>({
    queryKey: ["feed-online-friends", authUserId, acceptedFriendIds.join(",")],
    enabled: Boolean(authUserId && acceptedFriendIds.length),
    queryFn: async () => {
      if (acceptedFriendIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, avatar_url, is_online")
        .in("id", acceptedFriendIds)
        .eq("is_online", true)
        .order("updated_at", { ascending: false })
        .limit(10);

      if (profilesError) throw profilesError;
      return (profiles as ProfileMini[] | null) ?? [];
    },
  });

  useEffect(() => {
    if (!authUserId) return;

    const updateFeedPostStats = (
      postId: string,
      updater: (post: FeedPost) => FeedPost,
    ) => {
      queryClient.setQueryData<InfiniteData<FeedPage>>(["feed-posts-v2", authUserId], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) => ({
            ...page,
            rows: page.rows.map((row) => (row.id === postId ? updater(row) : row)),
          })),
        };
      });
    };

    const channel = (supabase as any)
      .channel(`feed-engagement-${authUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions" },
        (payload: any) => {
          const reaction = payload.new as { post_id: string; type: ReactionType };
          updateFeedPostStats(reaction.post_id, (post) => ({
            ...post,
            love_count: reaction.type === "love" ? post.love_count + 1 : post.love_count,
            hate_count: reaction.type === "hate" ? post.hate_count + 1 : post.hate_count,
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "reactions" },
        (payload: any) => {
          const reaction = payload.old as { post_id: string; type: ReactionType };
          updateFeedPostStats(reaction.post_id, (post) => ({
            ...post,
            love_count: reaction.type === "love" ? Math.max(0, post.love_count - 1) : post.love_count,
            hate_count: reaction.type === "hate" ? Math.max(0, post.hate_count - 1) : post.hate_count,
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        (payload: any) => {
          const comment = payload.new as { post_id: string };
          updateFeedPostStats(comment.post_id, (post) => ({
            ...post,
            comment_count: post.comment_count + 1,
          }));
        },
      )
      .subscribe();

    return () => {
      void (supabase as any).removeChannel(channel);
    };
  }, [authUserId, queryClient]);

  useEffect(() => {
    if (!authUserId) return;

    const channel = (supabase as any)
      .channel(`feed-friend-requests-${authUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "friendships",
          filter: `addressee_id=eq.${authUserId}`,
        },
        async (payload: any) => {
          const request = payload.new as { id: string; requester_id: string; status: string };
          if (request.status !== "pending") return;

          const { data: requester } = await (supabase as any)
            .from("profiles")
            .select("full_name")
            .eq("id", request.requester_id)
            .maybeSingle();

          const requesterName = requester?.full_name ?? "Someone";

          toast(`${requesterName} sent you a friend request!`, {
            action: {
              label: "Accept",
              onClick: () => acceptFriendRequestMutation.mutate(request.id),
            },
          });

          void queryClient.invalidateQueries({ queryKey: ["feed-suggestions", authUserId] });
        },
      )
      .subscribe();

    return () => {
      void (supabase as any).removeChannel(channel);
    };
  }, [acceptFriendRequestMutation, authUserId, queryClient]);

  useEffect(() => {
    if (!authUserId || acceptedFriendIds.length === 0) return;

    const channel = (supabase as any)
      .channel(`feed-online-friends-${authUserId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload: any) => {
          const next = payload.new as ProfileMini;
          if (!acceptedFriendIds.includes(next.id)) return;

          queryClient.setQueryData<ProfileMini[]>(["feed-online-friends", authUserId, acceptedFriendIds.join(",")], (prev = []) => {
            const existing = prev.find((friend) => friend.id === next.id);

            if (next.is_online) {
              const merged: ProfileMini = {
                id: next.id,
                full_name: next.full_name ?? existing?.full_name ?? null,
                avatar_url: next.avatar_url ?? existing?.avatar_url ?? null,
                is_online: true,
              };

              const filtered = prev.filter((friend) => friend.id !== next.id);
              return [merged, ...filtered].slice(0, 10);
            }

            return prev.filter((friend) => friend.id !== next.id);
          });
        },
      )
      .subscribe();

    return () => {
      void (supabase as any).removeChannel(channel);
    };
  }, [acceptedFriendIds, authUserId, queryClient]);

  return (
    <div className="mx-auto grid max-w-[980px] grid-cols-1 gap-6 lg:grid-cols-[minmax(0,640px)_280px]">
      <section className="space-y-3">
        <article className="sticky top-20 z-20 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <button
            type="button"
            className="flex w-full items-center gap-3 text-left"
            onClick={() => setComposerOpen(true)}
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={me?.avatar_url ?? ""} alt={me?.full_name ?? "You"} />
              <AvatarFallback>{getInitials(me?.full_name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm text-muted-foreground">
              {`What's on your mind, ${getFirstName(me?.full_name)}?`}
            </div>
          </button>

          <div className="mt-3 border-t border-border pt-3">
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={() => {
                setComposerOpen(true);
                setAutoOpenPicker(true);
              }}
            >
              <ImagePlus className="h-4 w-4" />
              📷 Photo
            </Button>
          </div>
        </article>

        {isLoading ? <FeedSkeleton /> : null}

        {isError ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">Something went wrong loading your feed.</p>
            <Button variant="outline" className="mt-3 rounded-full" onClick={() => void refetch()}>
              Try Again
            </Button>
          </div>
        ) : null}

        {!isLoading && !isError && posts.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <UsersRound className="mx-auto h-20 w-20 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Your feed is empty — add some friends to see their posts!</p>
            <Button asChild className="mt-4 rounded-full">
              <Link to="/search">Find People</Link>
            </Button>
          </div>
        ) : null}

        {!isLoading && !isError
          ? posts.map((post) => (
              <div key={post.id} id={`feed-post-${post.id}`}>
                <PostCard
                  post={{
                    id: post.id,
                    type: post.type,
                    content: post.content,
                    media_url: post.media_url,
                    created_at: post.created_at,
                  }}
                  author={{
                    id: post.author_id,
                    full_name: post.author_name,
                    avatar_url: post.author_avatar,
                  }}
                  reactions={{
                    love_count: post.love_count,
                    hate_count: post.hate_count,
                    my_reaction: post.my_reaction,
                  }}
                  comment_count={post.comment_count}
                  current_user_id={authUserId ?? ""}
                  onDeleted={(postId) => {
                    queryClient.setQueryData<InfiniteData<FeedPage>>(["feed-posts-v2", authUserId], (prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        pages: prev.pages.map((page) => ({
                          ...page,
                          rows: page.rows.filter((row) => row.id !== postId),
                        })),
                      };
                    });
                  }}
                />
              </div>
            ))
          : null}

        {isFetchingNextPage ? (
          <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading more posts...
          </div>
        ) : null}
      </section>

      <aside className="sticky top-20 hidden h-fit space-y-4 lg:block">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">People You May Know</h3>
          <div className="mt-3 space-y-3">
            {suggestions.map((person) => {
              const sent = Boolean(sentRequests[person.id]);
              return (
                <div key={person.id} className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={person.avatar_url ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${person.id}`} alt={person.full_name ?? "User"} />
                    <AvatarFallback>{getInitials(person.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{person.full_name || "Unnamed user"}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    disabled={sent || addFriendMutation.isPending}
                    onClick={() => addFriendMutation.mutate(person.id)}
                  >
                    {sent ? "Request Sent ⏳" : "Add Friend"}
                  </Button>
                </div>
              );
            })}
            {suggestions.length === 0 ? <p className="text-xs text-muted-foreground">No suggestions right now.</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Friends Online
          </h3>
          <div className="mt-3 space-y-3">
            {onlineFriends.map((friend) => (
              <div key={friend.id} className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={friend.avatar_url ?? ""} alt={friend.full_name ?? "User"} />
                    <AvatarFallback>{getInitials(friend.full_name)}</AvatarFallback>
                  </Avatar>
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-card bg-primary" />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{friend.full_name || "Unnamed user"}</p>
                <Button asChild size="icon" variant="ghost" className="h-8 w-8 rounded-full">
                  <Link to={`/chat?with=${friend.id}`} aria-label={`Message ${friend.full_name ?? "friend"}`}>
                    <MessageCircle className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
            {onlineFriends.length === 0 ? <p className="text-xs text-muted-foreground">No friends online.</p> : null}
          </div>
        </section>
      </aside>

      <Dialog
        open={composerOpen}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) resetComposer();
        }}
      >
        <DialogContent className="max-w-[520px] rounded-2xl border-border bg-card p-5">
          <DialogHeader>
            <DialogTitle>Create post</DialogTitle>
            <DialogDescription>Share what&apos;s happening with your friends.</DialogDescription>
          </DialogHeader>

          <input
            ref={uploadInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                appToast.error("Image size must be 10MB or less.");
                return;
              }

              if (composerPreview) URL.revokeObjectURL(composerPreview);
              const preview = URL.createObjectURL(file);
              setComposerFile(file);
              setComposerPreview(preview);
            }}
          />

          <Textarea
            ref={composerTextareaRef}
            value={composerText}
            onChange={(event) => setComposerText(event.target.value.slice(0, 500))}
            placeholder="Share what's on your mind..."
            className="min-h-[80px] resize-none rounded-xl"
            maxLength={500}
          />

          <button
            type="button"
            className="block w-full rounded-xl border border-dashed border-border bg-background p-4 text-left text-sm text-muted-foreground hover:bg-accent"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                appToast.error("Image size must be 10MB or less.");
                return;
              }

              if (composerPreview) URL.revokeObjectURL(composerPreview);
              const preview = URL.createObjectURL(file);
              setComposerFile(file);
              setComposerPreview(preview);
            }}
            onClick={() => uploadInputRef.current?.click()}
          >
            {composerPreview ? (
              <img src={composerPreview} alt="Post preview" className="max-h-56 w-full rounded-lg object-cover" />
            ) : (
              "Drag and drop a photo here, or click to browse"
            )}
          </button>

          <p className="text-right text-xs text-muted-foreground">{composerText.trim().length}/500</p>

          <Button
            type="button"
            className="w-full rounded-full bg-gradient-to-r from-primary to-primary/80"
            disabled={createPostMutation.isPending || (!composerText.trim() && !composerFile)}
            onClick={() => createPostMutation.mutate()}
          >
            {createPostMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
          </Button>
        </DialogContent>
      </Dialog>

      {showBackToTop ? (
        <Button
          type="button"
          size="icon"
          className="fixed bottom-24 right-4 z-40 h-10 w-10 rounded-full shadow-md md:bottom-6"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
};

export default Feed;
