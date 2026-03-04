import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Search, UserRoundSearch, X } from "lucide-react";
import { appToast } from "@/lib/app-toast";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

type SearchProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
};

type SearchResult = {
  profile: SearchProfile;
  friendship: FriendshipRow | null;
};

const getInitials = (name?: string | null) => {
  const safe = name?.trim();
  if (!safe) return "U";
  return safe
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

const similarityScore = (name: string, query: string) => {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n === q) return 4;
  if (n.startsWith(q)) return 3;
  if (n.includes(q)) return 2;
  return 1;
};

const SearchPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQ = searchParams.get("q") ?? "";
  const [inputValue, setInputValue] = useState(initialQ);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const query = (searchParams.get("q") ?? "").trim();

  const { data: authUserId } = useQuery<string | null>({
    queryKey: ["auth-user-id"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
  });

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    setInputValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const next = inputValue.trim();
      if (next) {
        setSearchParams({ q: next }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [inputValue, setSearchParams]);

  const resultsQueryKey = useMemo(() => ["search-results", authUserId, query], [authUserId, query]);

  const { data: results = [], isLoading, isFetching } = useQuery<SearchResult[]>({
    queryKey: resultsQueryKey,
    enabled: Boolean(authUserId && query.length > 0),
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, avatar_url, created_at")
        .ilike("full_name", `%${query}%`)
        .neq("id", authUserId)
        .limit(20);

      if (profilesError) throw profilesError;

      const profileRows = ((profiles as SearchProfile[] | null) ?? []).sort((a, b) => {
        const aScore = similarityScore(a.full_name ?? "", query);
        const bScore = similarityScore(b.full_name ?? "", query);
        if (aScore !== bScore) return bScore - aScore;
        return (a.full_name ?? "").localeCompare(b.full_name ?? "");
      });

      if (profileRows.length === 0) return [];

      const ids = profileRows.map((row) => row.id);
      const idsCsv = ids.join(",");

      const { data: friendships, error: friendshipsError } = await (supabase as any)
        .from("friendships")
        .select("id, status, requester_id, addressee_id")
        .or(
          `and(requester_id.eq.${authUserId},addressee_id.in.(${idsCsv})),and(requester_id.in.(${idsCsv}),addressee_id.eq.${authUserId})`,
        );

      if (friendshipsError) throw friendshipsError;

      const friendshipMap = new Map<string, FriendshipRow>();
      (((friendships as FriendshipRow[] | null) ?? [])).forEach((friendship) => {
        const otherId = friendship.requester_id === authUserId ? friendship.addressee_id : friendship.requester_id;
        friendshipMap.set(otherId, friendship);
      });

      return profileRows.map((profile) => ({
        profile,
        friendship: friendshipMap.get(profile.id) ?? null,
      }));
    },
  });

  const updateResultFriendship = (targetUserId: string, nextFriendship: FriendshipRow | null) => {
    queryClient.setQueryData<SearchResult[]>(resultsQueryKey, (prev = []) =>
      prev.map((entry) =>
        entry.profile.id === targetUserId
          ? {
              ...entry,
              friendship: nextFriendship,
            }
          : entry,
      ),
    );
  };

  const addFriendMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await (supabase as any)
        .from("friendships")
        .insert({ requester_id: authUserId, addressee_id: targetUserId, status: "pending" })
        .select("id, requester_id, addressee_id, status")
        .single();

      if (error) throw error;
      return data as FriendshipRow;
    },
    onSuccess: (friendship) => {
      const otherId = friendship.requester_id === authUserId ? friendship.addressee_id : friendship.requester_id;
      updateResultFriendship(otherId, friendship);
      appToast.friendRequestSent();
    },
    onError: (error: Error) => appToast.error(error),
  });

  const acceptFriendMutation = useMutation({
    mutationFn: async (friendship: FriendshipRow) => {
      const { data, error } = await (supabase as any)
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", friendship.id)
        .select("id, requester_id, addressee_id, status")
        .single();

      if (error) throw error;
      return data as FriendshipRow;
    },
    onSuccess: (friendship) => {
      const otherId = friendship.requester_id === authUserId ? friendship.addressee_id : friendship.requester_id;
      updateResultFriendship(otherId, friendship);
      appToast.friendRequestAccepted();
    },
    onError: (error: Error) => appToast.error(error),
  });

  const declineFriendMutation = useMutation({
    mutationFn: async (friendship: FriendshipRow) => {
      const { data, error } = await (supabase as any)
        .from("friendships")
        .update({ status: "declined" })
        .eq("id", friendship.id)
        .select("id, requester_id, addressee_id, status")
        .single();

      if (error) throw error;
      return data as FriendshipRow;
    },
    onSuccess: (friendship) => {
      const otherId = friendship.requester_id === authUserId ? friendship.addressee_id : friendship.requester_id;
      updateResultFriendship(otherId, friendship);
      appToast.settingsSaved();
    },
    onError: (error: Error) => appToast.error(error),
  });

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 pb-6">
      <div className="sticky top-16 z-20 bg-background/95 py-2 backdrop-blur-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Search for people by name..."
            className="h-[52px] rounded-full pl-12 pr-12 text-base"
          />
          {inputValue ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
              onClick={() => setInputValue("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {query ? (
          <p className="mt-2 text-sm text-muted-foreground">{`Showing ${results.length} results for '${query}'`}</p>
        ) : null}
      </div>

      {!query ? (
        <section className="flex min-h-[48vh] flex-col items-center justify-center text-center">
          <UserRoundSearch className="h-20 w-20 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">Find your friends on SocialSphere</h1>
          <p className="mt-2 text-sm text-muted-foreground">Search by first name or full name</p>
        </section>
      ) : isLoading || isFetching ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-9 flex-1 rounded-full" />
                <Skeleton className="h-9 flex-1 rounded-full" />
              </div>
            </div>
          ))}
        </section>
      ) : results.length === 0 ? (
        <section className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <div className="h-20 w-20 rounded-full border border-border bg-card" />
          <p className="mt-4 text-sm font-medium">{`No users found for '${query}'`}</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a different name or spelling</p>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {results.map(({ profile, friendship }) => {
            const isPendingFromMe = friendship?.status === "pending" && friendship.requester_id === authUserId;
            const isPendingToMe = friendship?.status === "pending" && friendship.addressee_id === authUserId;
            const isAccepted = friendship?.status === "accepted";

            return (
              <article key={profile.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-16 w-16">
                    <AvatarImage
                      src={profile.avatar_url ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(profile.full_name ?? profile.id)}`}
                      alt={profile.full_name ?? "User"}
                    />
                    <AvatarFallback>{getInitials(profile.full_name)}</AvatarFallback>
                  </Avatar>

                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{profile.full_name || "Unnamed user"}</p>
                    <p className="text-xs text-muted-foreground">Joined {format(new Date(profile.created_at), "MMMM yyyy")}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {!friendship || friendship.status === "declined" ? (
                    <>
                      <Button
                        type="button"
                        className="rounded-full"
                        onClick={() => addFriendMutation.mutate(profile.id)}
                        disabled={addFriendMutation.isPending}
                      >
                        {addFriendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Friend"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-full"
                        onClick={() => navigate(`/profile/${profile.id}`)}
                      >
                        View Profile
                      </Button>
                    </>
                  ) : null}

                  {isPendingFromMe ? (
                    <Button type="button" variant="secondary" className="rounded-full" disabled>
                      Request Sent ⏳
                    </Button>
                  ) : null}

                  {isPendingToMe && friendship ? (
                    <>
                      <Button
                        type="button"
                        className="rounded-full"
                        onClick={() => acceptFriendMutation.mutate(friendship)}
                        disabled={acceptFriendMutation.isPending}
                      >
                        Accept ✅
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-full"
                        onClick={() => declineFriendMutation.mutate(friendship)}
                        disabled={declineFriendMutation.isPending}
                      >
                        Decline
                      </Button>
                    </>
                  ) : null}

                  {isAccepted ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        className="rounded-full border border-transparent bg-[hsl(var(--toast-success))] text-[hsl(var(--toast-success-foreground))] transition-colors duration-300"
                        disabled
                      >
                        Friends ✓
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-full"
                        onClick={() => navigate(`/chat?with=${profile.id}`)}
                      >
                        💬 Message
                      </Button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
};

export default SearchPage;
