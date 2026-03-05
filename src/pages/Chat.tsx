import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
  is_read: boolean
}

type Conversation = {
  friend_id: string
  full_name: string | null
  avatar_url: string | null
  last_message: string | null
  last_time: string | null
}

const Chat = () => {

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const selectedFriendId = searchParams.get("with")

  const [draft,setDraft] = useState("")
  const bottomRef = useRef<HTMLDivElement | null>(null)

  /*
  ======================
  AUTH USER
  ======================
  */

  const {data:authUserId} = useQuery({
    queryKey:["auth-user"],
    queryFn: async ()=>{
      const {data} = await supabase.auth.getUser()
      return data.user?.id ?? null
    }
  })

  /*
  ======================
  CONVERSATIONS
  ======================
  */

  const {data:conversations=[]} = useQuery<Conversation[]>({
    queryKey:["conversations",authUserId],
    enabled: !!authUserId,
    queryFn: async ()=>{

      const {data:friends} = await supabase
      .from("accepted_friends")
      .select("friend_id")
      .eq("user_id",authUserId)

      const ids = friends?.map(f=>f.friend_id) ?? []

      if(ids.length===0) return []

      const {data:profiles} = await supabase
      .from("profiles")
      .select("id,full_name,avatar_url")
      .in("id",ids)

      const results:Conversation[] = []

      for(const p of profiles ?? []){

        const {data:last} = await supabase
        .from("messages")
        .select("content,created_at")
        .or(`and(sender_id.eq.${authUserId},receiver_id.eq.${p.id}),and(sender_id.eq.${p.id},receiver_id.eq.${authUserId})`)
        .order("created_at",{ascending:false})
        .limit(1)
        .maybeSingle()

        results.push({
          friend_id:p.id,
          full_name:p.full_name,
          avatar_url:p.avatar_url,
          last_message:last?.content ?? null,
          last_time:last?.created_at ?? null
        })
      }

      return results.sort((a,b)=>{
        if(!a.last_time) return 1
        if(!b.last_time) return -1
        return new Date(b.last_time).getTime() - new Date(a.last_time).getTime()
      })

    }
  })

  const selectedConversation = conversations.find(
    c=>c.friend_id===selectedFriendId
  )

  /*
  ======================
  MESSAGES
  ======================
  */

  const {data:messages=[]} = useQuery<Message[]>({
    queryKey:["messages",authUserId,selectedFriendId],
    enabled: !!authUserId && !!selectedFriendId,
    queryFn: async ()=>{

      const {data} = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${authUserId},receiver_id.eq.${selectedFriendId}),and(sender_id.eq.${selectedFriendId},receiver_id.eq.${authUserId})`
      )
      .order("created_at",{ascending:true})

      return data ?? []

    }
  })

  /*
  ======================
  MARK READ
  ======================
  */

  useEffect(()=>{

    if(!authUserId || !selectedFriendId) return

    const mark = async()=>{

      await supabase
      .from("messages")
      .update({is_read:true})
      .eq("receiver_id",authUserId)
      .eq("sender_id",selectedFriendId)
      .eq("is_read",false)

      queryClient.invalidateQueries({queryKey:["notifications"]})

    }

    mark()

  },[authUserId,selectedFriendId,queryClient])

  /*
  ======================
  SEND MESSAGE
  ======================
  */

  const sendMutation = useMutation({

    mutationFn: async(content:string)=>{

      if(!authUserId || !selectedFriendId) return

      const {data,error} = await supabase
      .from("messages")
      .insert({
        sender_id:authUserId,
        receiver_id:selectedFriendId,
        content
      })
      .select()
      .single()

      if(error) throw error

      return data

    },

    onSuccess:()=>{
      queryClient.invalidateQueries({queryKey:["messages"]})
      queryClient.invalidateQueries({queryKey:["conversations"]})
    }

  })

  const handleSubmit=(e:FormEvent)=>{

    e.preventDefault()

    if(!draft.trim()) return

    sendMutation.mutate(draft)

    setDraft("")

  }

  useEffect(()=>{
    bottomRef.current?.scrollIntoView({behavior:"smooth"})
  },[messages])

  /*
  ======================
  UI
  ======================
  */

  return(
    <div className="flex h-[calc(100vh-64px)] rounded-xl overflow-hidden border">

      {/* SIDEBAR */}

      <aside className="w-[300px] border-r bg-card">

        <div className="p-4 font-semibold">
          Messages
        </div>

        {conversations.map(c=>{

          return(
            <button
            key={c.friend_id}
            className="w-full text-left p-3 hover:bg-accent"
            onClick={()=>navigate(`/chat?with=${c.friend_id}`)}
            >

              <div className="flex gap-3">

                <Avatar>
                  <AvatarImage src={c.avatar_url ?? ""}/>
                  <AvatarFallback>
                    {c.full_name?.[0] ?? "U"}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">

                  <p className="font-semibold text-sm">
                    {c.full_name}
                  </p>

                  <p className="text-xs text-muted-foreground truncate">
                    {c.last_message ?? "No messages yet"}
                  </p>

                </div>

              </div>

            </button>
          )

        })}

      </aside>

      {/* CHAT */}

      <section className="flex flex-col flex-1">

        {!selectedConversation ? (

          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select chat
          </div>

        ):(
          <>

          <header className="border-b p-4 font-semibold">
            {selectedConversation.full_name}
          </header>

          <div className="flex-1 overflow-y-auto p-4">

            {messages.map(m=>{

              const isMe = m.sender_id===authUserId

              return(
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

                    {isMe && (

                      <div className="text-[10px] mt-1 opacity-70 text-right">

                        {m.is_read ? "Seen ✓" : "Delivered"}

                      </div>

                    )}

                  </div>

                </div>
              )

            })}

            <div ref={bottomRef}/>

          </div>

          <form
          onSubmit={handleSubmit}
          className="border-t p-3 flex gap-2"
          >

            <Input
            value={draft}
            onChange={(e)=>setDraft(e.target.value)}
            placeholder="Message..."
            />

            <Button type="submit">
              <Send size={16}/>
            </Button>

          </form>

          </>
        )}

      </section>

    </div>
  )

}

export default Chat