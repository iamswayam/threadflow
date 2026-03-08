import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Crown, GitBranch, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import BulkPost from "@/pages/bulk";
import ThreadChain from "@/pages/ThreadChain";

const MULTIPOST_PREFILL_KEY = "multipost_prefill";
const THREADCHAIN_PREFILL_KEY = "threadchain_prefill";

export default function MultiPost() {
  const { user } = useAuth();
  const [devProMode, setDevProMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"chain" | "bulk">("chain");
  const isProPlan = devProMode || user?.plan === "pro";

  useEffect(() => {
    const syncProMode = () => {
      try {
        setDevProMode(localStorage.getItem("threadflow_dev_pro") === "true");
      } catch {
        setDevProMode(false);
      }
    };

    syncProMode();
    window.addEventListener("focus", syncProMode);
    window.addEventListener("threadflow-pro-mode-change", syncProMode);
    return () => {
      window.removeEventListener("focus", syncProMode);
      window.removeEventListener("threadflow-pro-mode-change", syncProMode);
    };
  }, []);

  useEffect(() => {
    try {
      const multiPrefill = sessionStorage.getItem(MULTIPOST_PREFILL_KEY);
      if (multiPrefill) {
        sessionStorage.setItem(THREADCHAIN_PREFILL_KEY, multiPrefill);
        sessionStorage.removeItem(MULTIPOST_PREFILL_KEY);
        setActiveTab("chain");
        return;
      }

      if (sessionStorage.getItem(THREADCHAIN_PREFILL_KEY)) {
        setActiveTab("chain");
      }
    } catch {
      // Ignore storage access errors.
    }
  }, []);

  if (!isProPlan) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
          <Crown className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Multi-Post is a Pro feature</p>
          <p className="text-sm text-muted-foreground mt-1">
            Enable Pro from the sidebar toggle to unlock Multi-Post.
          </p>
        </div>
        <Link href="/settings">
          <Button variant="outline">View Plan Settings</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 pt-3 pb-6 h-full overflow-hidden flex flex-col">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-foreground">Multi-Post</h1>
        <span className="text-sm text-muted-foreground">Thread series or batch scheduling</span>
      </div>

      <div className="mt-4 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("chain")}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "chain"
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="button-tab-thread-chain"
          >
            <GitBranch className="w-4 h-4" />
            Thread Chain
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bulk")}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "bulk"
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="button-tab-bulk-post"
          >
            <Layers className="w-4 h-4" />
            Bulk Post
          </button>
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-hidden">
        <div className={activeTab === "chain" ? "block h-full" : "hidden h-full"}>
          <ThreadChain />
        </div>
        <div className={activeTab === "bulk" ? "block h-full" : "hidden h-full"}>
          <BulkPost />
        </div>
      </div>
    </div>
  );
}
