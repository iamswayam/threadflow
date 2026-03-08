import { useState } from "react";
import { MessageCircle, MessagesSquare } from "lucide-react";
import Comments from "@/pages/comments";
import ReplyCenter from "@/pages/reply-center";

export default function Engagement() {
  const [activeTab, setActiveTab] = useState<"reply" | "comments">("reply");

  return (
    <div className="px-6 pt-3 pb-6 h-full overflow-hidden flex flex-col">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-foreground">Engagement</h1>
        <span className="text-sm text-muted-foreground">
          Manage replies and comments across your posts
        </span>
      </div>

      <div className="mt-4 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("reply")}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "reply"
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="button-tab-reply-center"
          >
            <MessageCircle className="w-4 h-4" />
            Reply Center
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("comments")}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "comments"
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="button-tab-comments"
          >
            <MessagesSquare className="w-4 h-4" />
            Comments
          </button>
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-hidden">
        <div className={activeTab === "reply" ? "block h-full" : "hidden h-full"}>
          <ReplyCenter />
        </div>
        <div className={activeTab === "comments" ? "block h-full" : "hidden h-full"}>
          <Comments />
        </div>
      </div>
    </div>
  );
}

