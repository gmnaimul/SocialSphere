import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Ellipsis, Send, Trash2 } from "lucide-react";
import { appToast } from "@/lib/app-toast";

import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ReactionType = "love" | "hate";

type PostCardProps = {
  post: { id: string; type: string; content: string | null; media_url: string | null; created_at: string };
  author: { id: string; full_name: string | null; avatar_url: string | null };
  reactions: { love_count: number; hate_count: number; my_reaction: ReactionType | null };
  comment_count: number;
  current_user_id: string;
  onDeleted?: (postId: string) => void;
};

type CommentItem = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  full_name: string | null;
  avatar_url: string | null;
};

const getAvatarFallback = (name?: string | null) => {
  const seed = encodeURIComponent(name?.trim() || "SocialSphere");
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
};

const applyReactionState = (
  prev: { love_count: number; hate_count: number; my_reaction: ReactionType | null },
  nextReaction: ReactionType | null,
) => {
  let nextLove = prev.love_count;
  let nextHate = prev.hate_count;

  if (prev.my_reaction === "love") nextLove = Math.max(0, nextLove - 1);
  if (prev.my_reaction === "hate") nextHate = Math.max(0, nextHate - 1);

  if (nextReaction === "love") nextLove += 1;
  if (nextReaction === "hate") nextHate += 1;

  return { love_count: nextLove, hate_count: nextHate, my_reaction: nextReaction };
};

export const PostCard = ({ post, author, reactions, comment_count, current_user_id, onDeleted }: PostCardProps) => {
  const queryClient = useQueryClient();
  const commentsQueryKey = useMemo(() => ["post-card-comments", post.id], [post.id]);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [bounceReaction, setBounceReaction] = useState<ReactionType | null>(null);
  const [reactionState, setReactionState] = useState(reactions);

  const timestamp = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });
  const isOwnPost = author.id === current_user_id;

  useEffect(() => {
    setReactionState(reactions);
  }, [reactions]);

  const shouldClamp = Boolean(post.content && post.content.length > 220);

  const { data: comments = [] } = useQuery<CommentItem[]>({
    queryKey: commentsQueryKey,
    enabled: isCommentsOpen,
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("comments")
        .select("id, post_id, user_id, content, created_at")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const baseRows = ((rows as Array<{ id: string; post_id: string; user_id: string; content: string; created_at: string }>) ?? []);
      const userIds = Array.from(new Set(baseRows.map((row) => row.user_id)));

      if (userIds.length === 0) return [];

      const { data: profileRows, error: profileError } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);

      if (profileError) throw profileError;

      const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>(
        (((profileRows as Array<{ id: string; full_name: string | null; avatar_url: string | null }>) ?? [])).map((profile) => [
          profile.id,
          { full_name: profile.full_name, avatar_url: profile.avatar_url },
        ]),
      );

      return baseRows.map((row) => ({
        ...row,
        full_name: profileMap.get(row.user_id)?.full_name ?? null,
        avatar_url: profileMap.get(row.user_id)?.avatar_url ?? null,
      }));
    },
  });

  const { data: me } = useQuery<{ id: string; full_name: string | null; avatar_url: string | null } | null>({
    queryKey: ["post-card-current-user", current_user_id],
    enabled: Boolean(current_user_id && isCommentsOpen),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", current_user_id)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    },
  });

  useEffect(() => {
    const commentsChannel = (supabase as any)
      .channel(`post-card-comments-${post.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${post.id}` },
        async (payload: any) => {
          const inserted = payload.new as { id: string; post_id: string; user_id: string; content: string; created_at: string };
          const { data: profileRow } = await (supabase as any)
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", inserted.user_id)
            .maybeSingle();

          queryClient.setQueryData<CommentItem[]>(commentsQueryKey, (prev = []) => {
            if (prev.some((comment) => comment.id === inserted.id)) return prev;
            return [
              ...prev,
              {
                ...inserted,
                full_name: profileRow?.full_name ?? null,
                avatar_url: profileRow?.avatar_url ?? null,
              },
            ];
          });
        },
      )
      .subscribe();

    const reactionsChannel = (supabase as any)
      .channel(`post-card-reactions-${post.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions", filter: `post_id=eq.${post.id}` },
        (payload: any) => {
          const inserted = payload.new as { user_id: string; type: ReactionType };
          setReactionState((prev) => {
            if (inserted.user_id === current_user_id) {
              return applyReactionState(prev, inserted.type);
            }
            return {
              ...prev,
              love_count: inserted.type === "love" ? prev.love_count + 1 : prev.love_count,
              hate_count: inserted.type === "hate" ? prev.hate_count + 1 : prev.hate_count,
            };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "reactions", filter: `post_id=eq.${post.id}` },
        (payload: any) => {
          const removed = payload.old as { user_id: string; type: ReactionType };
          setReactionState((prev) => {
            if (removed.user_id === current_user_id) {
              return applyReactionState(prev, null);
            }
            return {
              ...prev,
              love_count: removed.type === "love" ? Math.max(0, prev.love_count - 1) : prev.love_count,
              hate_count: removed.type === "hate" ? Math.max(0, prev.hate_count - 1) : prev.hate_count,
            };
          });
        },
      )
      .subscribe();

    return () => {
      void (supabase as any).removeChannel(commentsChannel);
      void (supabase as any).removeChannel(reactionsChannel);
    };
  }, [commentsQueryKey, current_user_id, post.id, queryClient]);

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("posts").delete().eq("id", post.id);
      if (error) throw error;
    },
    onSuccess: () => {
      onDeleted?.(post.id);
      void queryClient.invalidateQueries({ queryKey: ["profile-page-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      appToast.postShared();
    },
    onError: (error: Error) => appToast.error(error),
  });

  const reactionMutation = useMutation({
    mutationFn: async (clickedType: ReactionType) => {
      const nextReaction = reactionState.my_reaction === clickedType ? null : clickedType;

      if (!current_user_id) throw new Error("You need to sign in first.");

      if (nextReaction === null) {
        const { error } = await (supabase as any)
          .from("reactions")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", current_user_id);
        if (error) throw error;
        return nextReaction;
      }

      const { error } = await (supabase as any).from("reactions").upsert(
        {
          post_id: post.id,
          user_id: current_user_id,
          type: nextReaction,
        },
        { onConflict: "post_id,user_id" },
      );

      if (error) throw error;
      return nextReaction;
    },
    onError: (error: Error) => appToast.error(error),
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await (supabase as any)
        .from("comments")
        .insert({ post_id: post.id, user_id: current_user_id, content })
        .select("id, post_id, user_id, content, created_at")
        .single();

      if (error) throw error;
      return data as { id: string; post_id: string; user_id: string; content: string; created_at: string };
    },
    onMutate: async (content: string) => {
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const optimisticComment: CommentItem = {
        id: optimisticId,
        post_id: post.id,
        user_id: current_user_id,
        content,
        created_at: new Date().toISOString(),
        full_name: me?.full_name ?? "You",
        avatar_url: me?.avatar_url ?? null,
      };

      queryClient.setQueryData<CommentItem[]>(commentsQueryKey, (prev = []) => [...prev, optimisticComment]);
      return { optimisticId };
    },
    onSuccess: () => {
      setCommentDraft("");
      void queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    onError: (error: Error, _content, context) => {
      if (context?.optimisticId) {
        queryClient.setQueryData<CommentItem[]>(commentsQueryKey, (prev = []) =>
          prev.filter((comment) => comment.id !== context.optimisticId),
        );
      }
      appToast.error(error);
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await (supabase as any).from("comments").delete().eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    onError: (error: Error) => appToast.error(error),
  });

  const handleReaction = (type: ReactionType) => {
    const previous = reactionState;
    const next = reactionState.my_reaction === type ? null : type;

    setBounceReaction(type);
    window.setTimeout(() => setBounceReaction(null), 150);
    setReactionState((prev) => applyReactionState(prev, next));

    reactionMutation.mutate(type, {
      onError: () => setReactionState(previous),
    });
  };

  const commentText = `${comments.length || comment_count} Comments`;

  return (
    <article className="post-card-lift rounded-2xl border border-border bg-card p-4 transition-shadow duration-200">
      <header className="flex items-start gap-3">
        <Link to={`/profile/${author.id}`} className="shrink-0">
          <Avatar className="h-10 w-10">
            <AvatarImage src={author.avatar_url || getAvatarFallback(author.full_name)} alt={author.full_name ?? "User"} />
            <AvatarFallback>{(author.full_name || "U").slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0 flex-1">
          <Link to={`/profile/${author.id}`} className="text-sm font-semibold hover:underline">
            {author.full_name || "Unnamed user"}
          </Link>
          <p className="text-xs text-muted-foreground">{timestamp}</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
              <Ellipsis className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Report</DropdownMenuItem>
            {isOwnPost ? (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => deletePostMutation.mutate()}
                disabled={deletePostMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Delete Post
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <section className="mt-3 space-y-3">
        {post.content ? (
          <div>
            <p className={cn("text-sm leading-relaxed", !isExpanded && shouldClamp && "line-clamp-3")}>{post.content}</p>
            {shouldClamp ? (
              <button
                type="button"
                className="mt-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setIsExpanded((prev) => !prev)}
              >
                {isExpanded ? "See less" : "See more"}
              </button>
            ) : null}
          </div>
        ) : null}

        {post.type === "photo" && post.media_url ? (
          <button
            type="button"
            className="relative w-full overflow-hidden rounded-xl border border-border text-left"
            onClick={() => setLightboxOpen(true)}
          >
            {!isImageLoaded ? <div className="absolute inset-0 animate-pulse bg-muted" /> : null}
            <img
              src={post.media_url}
              alt="Post photo"
              loading="lazy"
              className="max-h-[480px] w-full object-cover"
              onLoad={() => setIsImageLoaded(true)}
            />
          </button>
        ) : null}
      </section>

      <section className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "gap-1.5 rounded-full border px-3",
            reactionState.my_reaction === "love" ? "reaction-btn-active-love" : "reaction-btn-inactive",
          )}
          onClick={() => handleReaction("love")}
          disabled={reactionMutation.isPending}
        >
          <span className={cn("inline-block", bounceReaction === "love" && "reaction-icon-bounce")}>❤️</span>
          Love {reactionState.love_count}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className={cn(
            "gap-1.5 rounded-full border px-3",
            reactionState.my_reaction === "hate" ? "reaction-btn-active-hate" : "reaction-btn-inactive",
          )}
          onClick={() => handleReaction("hate")}
          disabled={reactionMutation.isPending}
        >
          <span className={cn("inline-block", bounceReaction === "hate" && "reaction-icon-bounce")}>👎</span>
          Hate {reactionState.hate_count}
        </Button>

        <button
          type="button"
          className="rounded-full px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => setIsCommentsOpen((prev) => !prev)}
        >
          💬 {commentText}
        </button>
      </section>

      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity] duration-[250ms] ease-in-out",
          isCommentsOpen ? "mt-3 max-h-[520px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="space-y-3 border-t border-border pt-3">
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-2">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={comment.avatar_url || getAvatarFallback(comment.full_name)} alt={comment.full_name ?? "User"} />
                  <AvatarFallback>{(comment.full_name || "U").slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1 rounded-xl bg-muted/50 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold">{comment.full_name || "User"}</p>
                    {comment.user_id === current_user_id ? (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => deleteCommentMutation.mutate(comment.id)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>

          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const payload = commentDraft.trim();
              if (!payload) return;
              addCommentMutation.mutate(payload);
            }}
          >
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={me?.avatar_url || getAvatarFallback(me?.full_name)} alt={me?.full_name ?? "You"} />
              <AvatarFallback>{(me?.full_name || "Y").slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <Input
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Write a comment..."
              className="h-9 rounded-full"
            />
            <Button type="submit" size="icon" className="h-9 w-9 rounded-full" disabled={addCommentMutation.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl border-border bg-card p-2">
          {post.media_url ? <img src={post.media_url} alt="Expanded post" className="max-h-[80vh] w-full rounded-lg object-contain" /> : null}
        </DialogContent>
      </Dialog>
    </article>
  );
};
