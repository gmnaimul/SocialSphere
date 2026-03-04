import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { appToast } from "@/lib/app-toast";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type PostComposerProps = {
  currentUserId: string;
};

const getFileExtension = (file: File) => {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
};

export const PostComposer = ({ currentUserId }: PostComposerProps) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [content, setContent] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const resetComposer = () => {
    setContent("");
    setSelectedImage(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const createPostMutation = useMutation({
    mutationFn: async ({ text, image }: { text: string; image: File | null }) => {
      let mediaUrl: string | null = null;

      if (image) {
        if (image.size > 10 * 1024 * 1024) {
          throw new Error("Image size must be 10MB or less.");
        }

        const extension = getFileExtension(image);
        const path = `${currentUserId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await (supabase as any).storage.from("post-media").upload(path, image, {
          upsert: false,
          contentType: image.type,
        });

        if (uploadError) throw uploadError;

        const { data } = (supabase as any).storage.from("post-media").getPublicUrl(path);
        mediaUrl = `${data.publicUrl}${data.publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
      }

      const payload = {
        user_id: currentUserId,
        content: text || null,
        media_url: mediaUrl,
        type: mediaUrl ? "photo" : "status",
      };

      const { error } = await (supabase as any).from("posts").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      resetComposer();
      void queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["profile-page-posts", currentUserId] });
      appToast.postShared();
    },
    onError: (error: Error) => {
      appToast.error(error);
    },
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setSelectedImage(file);
          setPreviewUrl(URL.createObjectURL(file));
        }}
      />

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const text = content.trim();
          if (!text && !selectedImage) return;
          createPostMutation.mutate({ text, image: selectedImage });
        }}
      >
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="What's on your mind?"
          className="min-h-[110px] resize-none rounded-xl"
          maxLength={1500}
        />

        {previewUrl ? (
          <div className="relative overflow-hidden rounded-xl border border-border">
            <img src={previewUrl} alt="Selected upload" className="max-h-80 w-full object-cover" />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute right-2 top-2 h-8 w-8 rounded-full"
              onClick={() => {
                setSelectedImage(null);
                setPreviewUrl(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus className="h-4 w-4" />
              Add photo
            </Button>
            <p className="text-xs text-muted-foreground">{content.trim().length}/1500</p>
          </div>

          <Button type="submit" className="rounded-full" disabled={createPostMutation.isPending || (!content.trim() && !selectedImage)}>
            {createPostMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
          </Button>
        </div>
      </form>
    </section>
  );
};
