import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Loader2, MessageCircle, Pencil, Trash2, UserPlus, Users, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/PostCard";
import { PostComposer } from "@/components/PostComposer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  date_of_birth: string | null;
  created_at: string;
  is_online: boolean | null;
  theme: string | null;
  font_size: string | null;
};

type PostRow = {
  id: string;
  user_id: string;
  content?: string | null;
  media_url?: string | null;
  type?: string | null;
  created_at: string;
};

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
};

type SuggestionRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

type FriendRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
};

const getAvatarFallback = (name?: string | null) => {
  const seed = encodeURIComponent(name?.trim() || "SocialSphere");
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
};

const formatJoined = (createdAt?: string | null) => {
  if (!createdAt) return "Joined recently";
  return `Joined ${new Date(createdAt).toLocaleString("en-US", { month: "long", year: "numeric" })}`;
};

const ProfileSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-[220px] rounded-b-2xl bg-muted" />
    <div className="-mt-10 flex items-end gap-4 px-6">
      <div className="h-24 w-24 rounded-full bg-muted" />
      <div className="space-y-2">
        <div className="h-6 w-44 rounded bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
      </div>
    </div>
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-28 rounded-2xl bg-muted" />
      ))}
    </div>
  </div>
);


const Profile = () => {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"posts" | "photos" | "friends">("posts");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [fullNameDraft, setFullNameDraft] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const coverFileRef = useRef<HTMLInputElement | null>(null);

  const { data: authUserId } = useQuery<string | null>({
    queryKey: ["auth-user-id"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
  });

  const profileId = routeId === "me" ? authUserId ?? "" : routeId ?? "";
  const isOwnProfile = Boolean(authUserId && profileId && authUserId === profileId);

  const { data: profile, isLoading: isProfileLoading } = useQuery<ProfileRow | null>({
    queryKey: ["profile-page-profile", profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, avatar_url, cover_url, date_of_birth, created_at, is_online, theme, font_size")
        .eq("id", profileId)
        .maybeSingle();

      if (error) throw error;
      return (data as ProfileRow | null) ?? null;
    },
  });

  const { data: posts = [], isLoading: isPostsLoading } = useQuery<PostRow[]>({
    queryKey: ["profile-page-posts", profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("posts")
        .select("id, user_id, content, media_url, type, created_at")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as PostRow[]) ?? [];
    },
  });

  const { data: friendship } = useQuery<FriendshipRow | null>({
    queryKey: ["profile-page-friendship", authUserId, profileId],
    enabled: Boolean(authUserId && profileId && authUserId !== profileId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("friendships")
        .select("id, requester_id, addressee_id, status")
        .or(
          `and(requester_id.eq.${authUserId},addressee_id.eq.${profileId}),and(requester_id.eq.${profileId},addressee_id.eq.${authUserId})`,
        )
        .maybeSingle();

      if (error) throw error;
      return (data as FriendshipRow | null) ?? null;
    },
  });

  const { data: suggestions = [] } = useQuery<SuggestionRow[]>({
    queryKey: ["profile-page-suggestions", authUserId, isOwnProfile],
    enabled: Boolean(authUserId && isOwnProfile),
    queryFn: async () => {
      const [profilesRes, friendshipsRes] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select("id, full_name, avatar_url, created_at")
          .neq("id", authUserId)
          .order("created_at", { ascending: false })
          .limit(50),
        (supabase as any)
          .from("friendships")
          .select("requester_id, addressee_id")
          .or(`requester_id.eq.${authUserId},addressee_id.eq.${authUserId}`),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (friendshipsRes.error) throw friendshipsRes.error;

      const excludedIds = new Set<string>(
        ((friendshipsRes.data as Array<{ requester_id: string; addressee_id: string }> | null) ?? [])
          .map((row) => (row.requester_id === authUserId ? row.addressee_id : row.requester_id))
          .filter(Boolean),
      );

      return (((profilesRes.data as SuggestionRow[] | null) ?? [])
        .filter((candidate) => !excludedIds.has(candidate.id))
        .slice(0, 10));
    },
  });

  const { data: friends = [], isLoading: isFriendsLoading } = useQuery<FriendRow[]>({
    queryKey: ["profile-page-friends", profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data: friendIdsRows, error: friendIdsError } = await (supabase as any)
        .from("accepted_friends")
        .select("friend_id")
        .eq("viewer_id", profileId);

      if (friendIdsError) throw friendIdsError;

      const friendIds = ((friendIdsRows as Array<{ friend_id: string | null }> | null) ?? [])
        .map((row) => row.friend_id)
        .filter((id): id is string => Boolean(id));

      if (friendIds.length === 0) return [];

      const { data: friendProfiles, error: friendProfilesError } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, avatar_url, is_online")
        .in("id", friendIds);

      if (friendProfilesError) throw friendProfilesError;

      const orderMap = new Map(friendIds.map((id, index) => [id, index]));
      return (((friendProfiles as FriendRow[] | null) ?? [])
        .sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999)));
    },
  });

  const refreshProfileQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ["profile-page-profile", profileId] });
    void queryClient.invalidateQueries({ queryKey: ["profile-mini", authUserId] });
    void queryClient.invalidateQueries({ queryKey: ["profile-page-friends", profileId] });
  };

  const updateNameMutation = useMutation({
    mutationFn: async (fullName: string) => {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", authUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      setIsEditingName(false);
      refreshProfileQueries();
    },
    onError: (error: Error) => setProfileError(error.message),
  });

  const addFriendMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await (supabase as any).from("friendships").insert({
        requester_id: authUserId,
        addressee_id: targetId,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile-page-friendship", authUserId, profileId] });
      void queryClient.invalidateQueries({ queryKey: ["profile-page-suggestions", authUserId, isOwnProfile] });
    },
    onError: (error: Error) => setProfileError(error.message),
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!friendship?.id) return;
      const { error } = await (supabase as any)
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", friendship.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile-page-friendship", authUserId, profileId] });
      void queryClient.invalidateQueries({ queryKey: ["profile-page-suggestions", authUserId, isOwnProfile] });
    },
    onError: (error: Error) => setProfileError(error.message),
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      if (!friendship?.id) return;
      const { error } = await (supabase as any).from("friendships").delete().eq("id", friendship.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile-page-friendship", authUserId, profileId] });
      void queryClient.invalidateQueries({ queryKey: ["profile-page-suggestions", authUserId, isOwnProfile] });
    },
    onError: (error: Error) => setProfileError(error.message),
  });

  const uploadProfileMedia = async (mode: "avatar" | "cover", file: File) => {
    if (!authUserId) return;
    if (file.size > 10 * 1024 * 1024) {
      setProfileError("File size must be 10MB or less.");
      return;
    }

    setProfileError(null);

    const bucket = mode === "avatar" ? "avatars" : "cover-photos";
    const path = `${authUserId}/${mode === "avatar" ? "avatar.jpg" : "cover.jpg"}`;

    const { error: uploadError } = await (supabase as any).storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

    if (uploadError) {
      setProfileError(uploadError.message);
      return;
    }

    const { data } = (supabase as any).storage.from(bucket).getPublicUrl(path);
    const targetColumn = mode === "avatar" ? "avatar_url" : "cover_url";
    const publicUrl = data.publicUrl;
    const cacheBustedUrl = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;

    const { error: updateError } = await (supabase as any)
      .from("profiles")
      .update({ [targetColumn]: cacheBustedUrl })
      .eq("id", authUserId);

    if (updateError) {
      setProfileError(updateError.message);
      return;
    }

    refreshProfileQueries();
  };

  const deleteOwnedPostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await (supabase as any).from("posts").delete().eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile-page-posts", profileId] });
      void queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
    onError: (error: Error) => setProfileError(error.message),
  });

  const photos = useMemo(
    () => posts.filter((post) => post.type === "photo" && Boolean(post.media_url)),
    [posts],
  );

  if (isProfileLoading || isPostsLoading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Profile not found.</p>
      </div>
    );
  }

  const isPendingFromMe = friendship?.status === "pending" && friendship.requester_id === authUserId;
  const isPendingToMe = friendship?.status === "pending" && friendship.addressee_id === authUserId;
  const isAccepted = friendship?.status === "accepted";

  return (
    <div className="space-y-6">
      <input
        ref={avatarFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadProfileMedia("avatar", file);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={coverFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadProfileMedia("cover", file);
          event.currentTarget.value = "";
        }}
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="group relative h-[220px] w-full rounded-b-2xl">
          {profile.cover_url ? (
            <img src={profile.cover_url} alt={`${profile.full_name ?? "User"} cover`} className="h-full w-full object-cover" />
          ) : (
            <div className="profile-cover-fallback h-full w-full" />
          )}

          {isOwnProfile && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute bottom-3 right-3 rounded-full border-border/60 bg-background/60 backdrop-blur-md opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => coverFileRef.current?.click()}
            >
              📷 Edit Cover
            </Button>
          )}
        </div>

        <div className="relative px-6 pb-6 pt-4">
          <div className="absolute -top-12 left-6">
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-background">
                <AvatarImage src={profile.avatar_url || getAvatarFallback(profile.full_name)} alt={profile.full_name ?? "User"} />
                <AvatarFallback>{(profile.full_name || "U").slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>

              {isOwnProfile && (
                <button
                  type="button"
                  className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  onClick={() => avatarFileRef.current?.click()}
                  aria-label="Upload avatar"
                >
                  <Camera className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4 pl-[122px]">
            <div>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={fullNameDraft}
                    onChange={(event) => setFullNameDraft(event.target.value)}
                    className="h-10 w-[240px]"
                  />
                  <Button
                    size="sm"
                    className="rounded-full"
                    disabled={updateNameMutation.isPending || !fullNameDraft.trim()}
                    onClick={() => updateNameMutation.mutate(fullNameDraft.trim())}
                  >
                    {updateNameMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      setIsEditingName(false);
                      setFullNameDraft(profile.full_name ?? "");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <h1 className="text-2xl font-bold">{profile.full_name || "Unnamed user"}</h1>
              )}

              <p className="mt-1 text-sm text-muted-foreground">{formatJoined(profile.created_at)}</p>
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", profile.is_online ? "status-online-dot" : "bg-muted-foreground/60")} />
                <span>{profile.is_online ? "Active now" : "Offline"}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isOwnProfile ? (
                <Button
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => {
                    setFullNameDraft(profile.full_name ?? "");
                    setIsEditingName(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  Edit Profile
                </Button>
              ) : (
                <>
                  {!friendship && (
                    <>
                      <Button className="rounded-full" onClick={() => addFriendMutation.mutate(profile.id)}>
                        <UserPlus className="h-4 w-4" />
                        Add Friend
                      </Button>
                      <Button variant="outline" className="rounded-full" onClick={() => navigate(`/chat?with=${profile.id}`)}>
                        <MessageCircle className="h-4 w-4" />
                        Message
                      </Button>
                    </>
                  )}

                  {isPendingFromMe && (
                    <Button variant="secondary" className="rounded-full" disabled>
                      Request Sent ⏳
                    </Button>
                  )}

                  {isPendingToMe && (
                    <>
                      <Button
                        className="rounded-full"
                        disabled={acceptMutation.isPending}
                        onClick={() => acceptMutation.mutate()}
                      >
                        {acceptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept Request ✅"}
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-full"
                        disabled={declineMutation.isPending}
                        onClick={() => declineMutation.mutate()}
                      >
                        Decline ✕
                      </Button>
                    </>
                  )}

                  {isAccepted && (
                    <>
                      <Button variant="secondary" className="rounded-full" disabled>
                        Friends ✓
                      </Button>
                      <Button variant="outline" className="rounded-full" onClick={() => navigate(`/chat?with=${profile.id}`)}>
                        <MessageCircle className="h-4 w-4" />
                        Message
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {profileError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {profileError}
        </div>
      )}

      {isOwnProfile && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">People You May Know</h2>
          <div className="mt-3 space-y-2">
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suggestions right now.</p>
            ) : (
              suggestions.map((person) => (
                <div key={person.id} className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-accent">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={person.avatar_url || getAvatarFallback(person.full_name)} alt={person.full_name ?? "User"} />
                      <AvatarFallback>{(person.full_name || "U").slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <p className="text-sm font-medium">{person.full_name || "Unnamed user"}</p>
                  </div>
                  <Button
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => addFriendMutation.mutate(person.id)}
                    disabled={addFriendMutation.isPending}
                  >
                    Add Friend
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <section className="space-y-4">
        {isOwnProfile ? <PostComposer currentUserId={authUserId ?? ""} /> : null}
        <div className="inline-flex rounded-full border border-border bg-muted p-1">
          <button
            className={cn(
              "rounded-full px-4 py-2 text-sm transition-colors",
              activeTab === "posts" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
            onClick={() => setActiveTab("posts")}
          >
            Posts
          </button>
          <button
            className={cn(
              "rounded-full px-4 py-2 text-sm transition-colors",
              activeTab === "photos" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
            onClick={() => setActiveTab("photos")}
          >
            Photos
          </button>
          <button
            className={cn(
              "rounded-full px-4 py-2 text-sm transition-colors",
              activeTab === "friends" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
            onClick={() => setActiveTab("friends")}
          >
            Friends
          </button>
        </div>

        {activeTab === "posts" ? (
          <div className="space-y-4">
            {posts.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">No posts yet.</div>
            ) : (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={{
                    id: post.id,
                    type: post.type ?? "status",
                    content: post.content ?? null,
                    media_url: post.media_url ?? null,
                    created_at: post.created_at,
                  }}
                  author={{
                    id: profile.id,
                    full_name: profile.full_name,
                    avatar_url: profile.avatar_url,
                  }}
                  reactions={{ love_count: 0, hate_count: 0, my_reaction: null }}
                  comment_count={0}
                  current_user_id={authUserId ?? ""}
                />
              ))
            )}
          </div>
        ) : activeTab === "photos" ? (
          <>
            {photos.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">No photos yet.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {photos.map((post) => (
                  <div key={post.id} className="group relative overflow-hidden rounded-xl border border-border">
                    <button
                      type="button"
                      className="w-full"
                      onClick={() => setLightboxUrl(post.media_url ?? null)}
                    >
                      <img src={post.media_url ?? ""} alt="Photo post" className="aspect-square w-full object-cover" loading="lazy" />
                    </button>

                    {isOwnProfile ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute right-2 top-2 h-8 w-8 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => deleteOwnedPostMutation.mutate(post.id)}
                        disabled={deleteOwnedPostMutation.isPending}
                        aria-label="Delete photo post"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            <Dialog open={Boolean(lightboxUrl)} onOpenChange={(open) => !open && setLightboxUrl(null)}>
              <DialogContent className="max-w-4xl border-border bg-card p-2">
                {lightboxUrl ? (
                  <img src={lightboxUrl} alt="Expanded photo" className="max-h-[80vh] w-full rounded-lg object-contain" />
                ) : null}
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" />
              <span>{friends.length} Friends</span>
            </div>

            {isFriendsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="h-12 rounded-xl bg-muted animate-shimmer-pulse" />
                ))}
              </div>
            ) : friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friends to show yet.</p>
            ) : (
              <div className="space-y-2">
                {friends.map((friend) => (
                  <div key={friend.id} className="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-accent">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={friend.avatar_url || getAvatarFallback(friend.full_name)} alt={friend.full_name ?? "Friend"} />
                        <AvatarFallback>{(friend.full_name || "U").slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{friend.full_name || "Unnamed user"}</p>
                        <p className="text-xs text-muted-foreground">{friend.is_online ? "Active now" : "Offline"}</p>
                      </div>
                    </div>

                    <Button variant="ghost" className="rounded-full" onClick={() => navigate(`/profile/${friend.id}`)}>
                      View
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </section>
    </div>
  );
};

export default Profile;
