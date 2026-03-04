import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, isSameDay } from "date-fns";
import { MessageCircle, Pencil, Send } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Conversation = {
  friend_id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  updated_at: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};

type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  created_at: string;
  is_read: boolean;
};

type MessageItem = MessageRow & {
  sender_name: string | null;
  sender_avatar: string | null;
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

const formatListTimestamp = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return format(date, isSameDay(date, new Date()) ? "p" : "MMM d");
};

const sortConversationsByLatest = (items: Conversation[]) =>
  [...items].sort((a, b) => {
    if (!a.last_message_at && !b.last_message_at) return 0;
    if (!a.last_message_at) return 1;
    if (!b.last_message_at) return -1;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });

const Chat = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState("");
  const [draft, setDraft] = useState("");
  const [friendTyping, setFriendTyping] = useState(false);

  const typingChannelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastTypingBroadcastAtRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const selectedFriendId = searchParams.get("with");

  const { data: authUserId } = useQuery<string | null>({
    queryKey: ["auth-user-id"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
  });

  const messagesQueryKey = useMemo(
    () => ["chat-messages", authUserId, selectedFriendId],
    [authUserId, selectedFriendId],
  );

  const { data: conversations = [], isLoading: isConversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["chat-conversations", authUserId],
    enabled: Boolean(authUserId),
    queryFn: async () => {
      const { data: acceptedRows, error: acceptedError } = await (supabase as any)
        .from("accepted_friends")
        .select("friend_id")
        .eq("viewer_id", authUserId);

      if (acceptedError) throw acceptedError;

      const friendIds = Array.from(new Set(((acceptedRows as Array<{ friend_id: string }> | null) ?? []).map((row) => row.friend_id)));
      if (friendIds.length === 0) return [];

      const [profilesRes, unreadRowsRes, lastMessages] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select("id, full_name, avatar_url, is_online, updated_at")
          .in("id", friendIds),
        (supabase as any)
          .from("messages")
          .select("sender_id")
          .eq("receiver_id", authUserId)
          .eq("is_read", false)
          .in("sender_id", friendIds),
        Promise.all(
          friendIds.map(async (friendId) => {
            const { data, error } = await (supabase as any)
              .from("messages")
              .select("id, sender_id, receiver_id, content, created_at")
              .or(`and(sender_id.eq.${authUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${authUserId})`)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (error) throw error;
            return { friendId, message: (data as MessageRow | null) ?? null };
          }),
        ),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (unreadRowsRes.error) throw unreadRowsRes.error;

      const unreadBySender = new Map<string, number>();
      (((unreadRowsRes.data as Array<{ sender_id: string }> | null) ?? [])).forEach((row) => {
        unreadBySender.set(row.sender_id, (unreadBySender.get(row.sender_id) ?? 0) + 1);
      });

      const lastMessageByFriend = new Map<string, MessageRow | null>(
        lastMessages.map((entry) => [entry.friendId, entry.message]),
      );

      const rows = ((profilesRes.data as Array<{ id: string; full_name: string | null; avatar_url: string | null; is_online: boolean; updated_at: string | null }> | null) ?? []).map((profile) => ({
        friend_id: profile.id,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        is_online: Boolean(profile.is_online),
        updated_at: profile.updated_at,
        last_message: lastMessageByFriend.get(profile.id)?.content ?? null,
        last_message_at: lastMessageByFriend.get(profile.id)?.created_at ?? null,
        unread_count: unreadBySender.get(profile.id) ?? 0,
      }));

      return sortConversationsByLatest(rows);
    },
  });

  const filteredConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      const name = conversation.full_name?.toLowerCase() ?? "";
      const last = conversation.last_message?.toLowerCase() ?? "";
      return name.includes(query) || last.includes(query);
    });
  }, [conversations, searchTerm]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.friend_id === selectedFriendId) ?? null,
    [conversations, selectedFriendId],
  );

  const { data: messages = [], isLoading: isMessagesLoading } = useQuery<MessageItem[]>({
    queryKey: messagesQueryKey,
    enabled: Boolean(authUserId && selectedFriendId),
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("messages")
        .select("id, sender_id, receiver_id, content, created_at, is_read")
        .or(`and(sender_id.eq.${authUserId},receiver_id.eq.${selectedFriendId}),and(sender_id.eq.${selectedFriendId},receiver_id.eq.${authUserId})`)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const baseRows = (rows as MessageRow[] | null) ?? [];
      const senderIds = Array.from(new Set(baseRows.map((row) => row.sender_id)));

      if (senderIds.length === 0) return [];

      const { data: senders, error: sendersError } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", senderIds);

      if (sendersError) throw sendersError;

      const senderMap = new Map<string, { full_name: string | null; avatar_url: string | null }>(
        (((senders as Array<{ id: string; full_name: string | null; avatar_url: string | null }> | null) ?? [])).map((row) => [
          row.id,
          { full_name: row.full_name, avatar_url: row.avatar_url },
        ]),
      );

      return baseRows.map((row) => ({
        ...row,
        sender_name: senderMap.get(row.sender_id)?.full_name ?? null,
        sender_avatar: senderMap.get(row.sender_id)?.avatar_url ?? null,
      }));
    },
  });

  useEffect(() => {
    if (!authUserId || !selectedFriendId) return;

    const markRead = async () => {
      const { error } = await (supabase as any)
        .from("messages")
        .update({ is_read: true })
        .eq("receiver_id", authUserId)
        .eq("sender_id", selectedFriendId)
        .eq("is_read", false);

      if (error) return;

      queryClient.setQueryData<MessageItem[]>(messagesQueryKey, (prev = []) =>
        prev.map((message) =>
          message.sender_id === selectedFriendId && message.receiver_id === authUserId
            ? { ...message, is_read: true }
            : message,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations", authUserId] });
    };

    void markRead();
  }, [authUserId, messagesQueryKey, queryClient, selectedFriendId]);

  useEffect(() => {
    if (!authUserId) return;

    const channel = (supabase as any)
      .channel(`chat-listener-${authUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${authUserId}`,
        },
        async (payload: any) => {
          const incoming = payload.new as MessageRow;

          queryClient.setQueryData<Conversation[]>(["chat-conversations", authUserId], (prev = []) => {
            const index = prev.findIndex((conversation) => conversation.friend_id === incoming.sender_id);
            if (index < 0) return prev;

            const base = prev[index];
            const updated: Conversation = {
              ...base,
              unread_count: incoming.sender_id === selectedFriendId ? 0 : base.unread_count + 1,
              last_message: incoming.content,
              last_message_at: incoming.created_at,
            };

            const next = prev.filter((_, i) => i !== index);
            return [updated, ...next];
          });

          if (incoming.sender_id !== selectedFriendId) return;

          queryClient.setQueryData<MessageItem[]>(messagesQueryKey, (prev = []) => {
            if (prev.some((message) => message.id === incoming.id)) return prev;
            return [
              ...prev,
              {
                ...incoming,
                sender_name: selectedConversation?.full_name ?? null,
                sender_avatar: selectedConversation?.avatar_url ?? null,
              },
            ];
          });

          const { error } = await (supabase as any)
            .from("messages")
            .update({ is_read: true })
            .eq("id", incoming.id)
            .eq("receiver_id", authUserId);

          if (!error) {
            queryClient.setQueryData<MessageItem[]>(messagesQueryKey, (prev = []) =>
              prev.map((message) => (message.id === incoming.id ? { ...message, is_read: true } : message)),
            );
            queryClient.setQueryData<Conversation[]>(["chat-conversations", authUserId], (prev = []) =>
              prev.map((conversation) =>
                conversation.friend_id === incoming.sender_id
                  ? { ...conversation, unread_count: 0 }
                  : conversation,
              ),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
        },
        (payload: any) => {
          const nextProfile = payload.new as { id: string; is_online: boolean; updated_at: string | null };
          queryClient.setQueryData<Conversation[]>(["chat-conversations", authUserId], (prev = []) =>
            prev.map((conversation) =>
              conversation.friend_id === nextProfile.id
                ? {
                    ...conversation,
                    is_online: Boolean(nextProfile.is_online),
                    updated_at: nextProfile.updated_at,
                  }
                : conversation,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      void (supabase as any).removeChannel(channel);
    };
  }, [
    authUserId,
    messagesQueryKey,
    queryClient,
    selectedConversation?.avatar_url,
    selectedConversation?.full_name,
    selectedFriendId,
  ]);

  useEffect(() => {
    if (!authUserId || !selectedFriendId) return;

    const sortedPair = [authUserId, selectedFriendId].sort().join("-");
    const channel = (supabase as any)
      .channel(`typing:${sortedPair}`)
      .on("broadcast", { event: "typing" }, ({ payload }: any) => {
        if (payload?.type !== "typing" || payload?.user_id !== selectedFriendId) return;
        setFriendTyping(true);
        if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = window.setTimeout(() => setFriendTyping(false), 2000);
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      setFriendTyping(false);
      typingChannelRef.current = null;
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      void (supabase as any).removeChannel(channel);
    };
  }, [authUserId, selectedFriendId]);

  const emitTyping = () => {
    if (!authUserId || !selectedFriendId || !typingChannelRef.current) return;
    const now = Date.now();
    if (now - lastTypingBroadcastAtRef.current < 800) return;
    lastTypingBroadcastAtRef.current = now;

    void typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { type: "typing", user_id: authUserId },
    });
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!authUserId || !selectedFriendId) throw new Error("No conversation selected.");
      const { data, error } = await (supabase as any)
        .from("messages")
        .insert({ sender_id: authUserId, receiver_id: selectedFriendId, content })
        .select("id, sender_id, receiver_id, content, created_at, is_read")
        .single();

      if (error) throw error;
      return data as MessageRow;
    },
    onMutate: async (content: string) => {
      if (!authUserId || !selectedFriendId) return {};

      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const optimisticMessage: MessageItem = {
        id: optimisticId,
        sender_id: authUserId,
        receiver_id: selectedFriendId,
        content,
        created_at: new Date().toISOString(),
        is_read: false,
        sender_name: "You",
        sender_avatar: null,
      };

      queryClient.setQueryData<MessageItem[]>(messagesQueryKey, (prev = []) => [...prev, optimisticMessage]);
      queryClient.setQueryData<Conversation[]>(["chat-conversations", authUserId], (prev = []) => {
        const updated = prev.map((conversation) =>
          conversation.friend_id === selectedFriendId
            ? { ...conversation, last_message: content, last_message_at: optimisticMessage.created_at }
            : conversation,
        );
        return sortConversationsByLatest(updated);
      });

      return { optimisticId };
    },
    onSuccess: (saved, _content, context) => {
      queryClient.setQueryData<MessageItem[]>(messagesQueryKey, (prev = []) =>
        prev.map((message) =>
          message.id === context?.optimisticId
            ? { ...saved, sender_name: "You", sender_avatar: null }
            : message,
        ),
      );
      if (authUserId) {
        void queryClient.invalidateQueries({ queryKey: ["chat-conversations", authUserId] });
      }
    },
    onError: (error: Error, _content, context) => {
      if (context?.optimisticId) {
        queryClient.setQueryData<MessageItem[]>(messagesQueryKey, (prev = []) =>
          prev.filter((message) => message.id !== context.optimisticId),
        );
      }
      toast.error(error.message);
    },
  });

  const lastSentMessageId = useMemo(() => {
    if (!authUserId) return null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].sender_id === authUserId) return messages[index].id;
    }
    return null;
  }, [authUserId, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [friendTyping, messages]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload = draft.trim();
    if (!payload || !selectedFriendId) return;
    setDraft("");
    sendMessageMutation.mutate(payload);
  };

  return (
    <div className="h-[calc(100dvh-64px)] overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex h-full">
        <aside
          className={cn(
            "h-full w-[300px] shrink-0 border-r border-border bg-card",
            selectedFriendId ? "hidden md:block" : "block",
          )}
        >
          <header className="flex items-center justify-between border-b border-border p-4">
            <h1 className="text-lg font-semibold">Messages</h1>
            <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Compose message">
              <Pencil className="h-4 w-4" />
            </Button>
          </header>

          <div className="p-4 pt-3">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search conversations..."
              className="rounded-full"
            />
          </div>

          <div className="h-[calc(100%-8.5rem)] overflow-y-auto px-2 pb-2">
            {isConversationsLoading ? (
              <p className="px-3 py-6 text-sm text-muted-foreground">Loading conversations...</p>
            ) : filteredConversations.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted-foreground">No conversations yet.</p>
            ) : (
              filteredConversations.map((conversation) => {
                const isActive = conversation.friend_id === selectedFriendId;
                return (
                  <button
                    key={conversation.friend_id}
                    type="button"
                    className={cn(
                      "mb-1 flex w-full items-start gap-3 rounded-xl border-l-2 border-transparent px-3 py-2 text-left transition-colors",
                      isActive ? "border-primary bg-primary/10" : "hover:bg-accent",
                    )}
                    onClick={() => navigate(`/chat?with=${conversation.friend_id}`)}
                  >
                    <div className="relative">
                      <Avatar className="h-11 w-11">
                        <AvatarImage src={conversation.avatar_url ?? ""} alt={conversation.full_name ?? "Friend"} />
                        <AvatarFallback>{getInitials(conversation.full_name)}</AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-card",
                          conversation.is_online ? "bg-primary" : "bg-muted-foreground",
                        )}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{conversation.full_name || "Unnamed user"}</p>
                        <p className="shrink-0 text-xs text-muted-foreground">{formatListTimestamp(conversation.last_message_at)}</p>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{conversation.last_message || "No messages yet"}</p>
                    </div>

                    {conversation.unread_count > 0 ? (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                        {conversation.unread_count}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className={cn("h-full flex-1 bg-muted/30", selectedFriendId ? "flex" : "hidden md:flex")}>
          {!selectedFriendId || !selectedConversation ? (
            <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Select a conversation to start messaging</p>
            </div>
          ) : (
            <div className="grid h-full w-full grid-rows-[auto_1fr_auto]">
              <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedConversation.avatar_url ?? ""} alt={selectedConversation.full_name ?? "Friend"} />
                    <AvatarFallback>{getInitials(selectedConversation.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{selectedConversation.full_name || "Unnamed user"}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedConversation.is_online
                        ? "Active now"
                        : `Last seen ${formatDistanceToNow(new Date(selectedConversation.updated_at ?? new Date().toISOString()), { addSuffix: true })}`}
                    </p>
                  </div>
                </div>

                <Button type="button" variant="ghost" size="sm" className="rounded-full md:hidden" onClick={() => navigate("/chat")}>
                  Back
                </Button>
              </header>

              <div className="overflow-y-auto px-4 py-4">
                {isMessagesLoading ? <p className="text-sm text-muted-foreground">Loading messages...</p> : null}

                {!isMessagesLoading &&
                  messages.map((message, index) => {
                    const previous = index > 0 ? messages[index - 1] : null;
                    const showDateDivider = !previous || !isSameDay(new Date(previous.created_at), new Date(message.created_at));
                    const isMe = message.sender_id === authUserId;
                    const isSeenMarker = message.id === lastSentMessageId && isMe && message.is_read;

                    return (
                      <div key={message.id} className="mb-2">
                        {showDateDivider ? (
                          <div className="my-3 text-center text-xs text-muted-foreground">{format(new Date(message.created_at), "MMMM d, yyyy")}</div>
                        ) : null}

                        <div className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[70%] rounded-2xl px-3 py-2 text-sm",
                              isMe
                                ? "rounded-tr-sm bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
                                : "rounded-tl-sm bg-card text-card-foreground",
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            <p className={cn("mt-1 text-[10px]", isMe ? "text-primary-foreground/80" : "text-muted-foreground")}>
                              {format(new Date(message.created_at), "p")}
                            </p>
                          </div>
                        </div>

                        {isSeenMarker ? <p className="mt-1 text-right text-xs text-muted-foreground">Seen ✓</p> : null}
                      </div>
                    );
                  })}

                {friendTyping ? (
                  <div className="mb-2 flex justify-start">
                    <div className="rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:240ms]" />
                      </span>
                    </div>
                  </div>
                ) : null}

                <div ref={bottomRef} />
              </div>

              <form onSubmit={handleSubmit} className="border-t border-border bg-background p-3">
                <div className="flex items-center gap-2 rounded-full border border-input bg-background px-3 py-2">
                  <span aria-hidden className="text-base">
                    😊
                  </span>
                  <Input
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      if (event.target.value.trim()) emitTyping();
                    }}
                    placeholder={`Message ${selectedConversation.full_name?.split(" ")[0] ?? "friend"}...`}
                    className="h-auto border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    disabled={!draft.trim() || sendMessageMutation.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Chat;
