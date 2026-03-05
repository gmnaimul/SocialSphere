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
    .map((p) => p[0]?.toUpperCase())
    .join("");
};

const sortConversationsByLatest = (items: Conversation[]) =>
  [...items].sort((a, b) => {
    if (!a.last_message_at && !b.last_message_at) return 0;
    if (!a.last_message_at) return 1;
    if (!b.last_message_at) return -1;
    return (
      new Date(b.last_message_at).getTime() -
      new Date(a.last_message_at).getTime()
    );
  });

const Chat = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const selectedFriendId = searchParams.get("with");

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: authUserId } = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
  });

  const messagesKey = ["chat-messages", authUserId, selectedFriendId];

  // =========================
  // GET CONVERSATIONS
  // =========================

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["chat-conversations", authUserId],
    enabled: !!authUserId,
    queryFn: async () => {

      const { data: acceptedRows, error } = await supabase
        .from("accepted_friends")
        .select("friend_id")
        .eq("user_id", authUserId);

      if (error) throw error;

      const friendIds =
        acceptedRows?.map((r) => r.friend_id).filter(Boolean) ?? [];

      if (friendIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, is_online, updated_at")
        .in("id", friendIds);

      const rows: Conversation[] =
        profiles?.map((p) => ({
          friend_id: p.id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          is_online: !!p.is_online,
          updated_at: p.updated_at,
          last_message: null,
          last_message_at: null,
          unread_count: 0,
        })) ?? [];

      return sortConversationsByLatest(rows);
    },
  });

  const selectedConversation = conversations.find(
    (c) => c.friend_id === selectedFriendId
  );

  // =========================
  // GET MESSAGES
  // =========================

  const { data: messages = [] } = useQuery<MessageItem[]>({
    queryKey: messagesKey,
    enabled: !!authUserId && !!selectedFriendId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${authUserId},receiver_id.eq.${selectedFriendId}),and(sender_id.eq.${selectedFriendId},receiver_id.eq.${authUserId})`
        )
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data as MessageItem[]) ?? [];
    },
  });

  // =========================
  // SEND MESSAGE
  // =========================

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!authUserId || !selectedFriendId) return;

      const { data, error } = await supabase
        .from("messages")
        .insert({
          sender_id: authUserId,
          receiver_id: selectedFriendId,
          content,
        })
        .select()
        .single();

      if (error) throw error;

      return data as MessageRow;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey });
      queryClient.invalidateQueries({
        queryKey: ["chat-conversations", authUserId],
      });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!draft.trim()) return;

    sendMutation.mutate(draft.trim());
    setDraft("");
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // =========================
  // UI
  // =========================

  return (
    <div className="flex h-[calc(100vh-64px)] border rounded-2xl overflow-hidden">

      {/* Sidebar */}
      <aside className="w-[300px] border-r bg-card">
        <div className="p-4 font-semibold flex justify-between">
          Messages
          <Pencil size={18} />
        </div>

        {conversations.map((c) => (
          <button
            key={c.friend_id}
            className="w-full text-left p-3 hover:bg-accent"
            onClick={() => navigate(`/chat?with=${c.friend_id}`)}
          >
            <div className="flex gap-3">
              <Avatar>
                <AvatarImage src={c.avatar_url ?? ""} />
                <AvatarFallback>{getInitials(c.full_name)}</AvatarFallback>
              </Avatar>

              <div>
                <p className="text-sm font-semibold">{c.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.last_message ?? "No messages yet"}
                </p>
              </div>
            </div>
          </button>
        ))}
      </aside>

      {/* Chat Window */}
      <section className="flex flex-col flex-1">

        {!selectedConversation ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageCircle size={40} />
            <p>Select a conversation</p>
          </div>
        ) : (
          <>
            <header className="border-b p-4 font-semibold">
              {selectedConversation.full_name}
            </header>

            <div className="flex-1 overflow-y-auto p-4">

              {messages.map((m) => {
                const isMe = m.sender_id === authUserId;

                return (
                  <div
                    key={m.id}
                    className={cn(
                      "mb-2 flex",
                      isMe ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "px-3 py-2 rounded-xl max-w-[70%]",
                        isMe
                          ? "bg-primary text-primary-foreground"
                          : "bg-card"
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })}

              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={handleSubmit}
              className="border-t p-3 flex gap-2"
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message..."
              />

              <Button type="submit">
                <Send size={16} />
              </Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
};

export default Chat;