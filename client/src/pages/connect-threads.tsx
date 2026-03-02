import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { ThreadFlowLogoSquare } from "@/components/logo";
import { Link2, ExternalLink, CheckCircle2, ArrowRight, SkipForward } from "lucide-react";
import { motion } from "framer-motion";

const connectSchema = z.object({
  threadsAppId: z.string().optional(),
  threadsAppSecret: z.string().optional(),
  threadsAccessToken: z.string().min(1, "Access token is required"),
});

type ConnectForm = z.infer<typeof connectSchema>;

export default function ConnectThreads() {
  const [, setLocation] = useLocation();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);

  const form = useForm<ConnectForm>({
    resolver: zodResolver(connectSchema),
    defaultValues: { threadsAppId: "", threadsAppSecret: "", threadsAccessToken: "" },
  });

  const onSubmit = async (data: ConnectForm) => {
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/connect-threads", data);
      await refreshUser();
      setConnected(true);
      toast({ title: "Threads connected!", description: "Your account is now linked." });
      setTimeout(() => setLocation("/"), 1500);
    } catch (err: any) {
      const msg = err.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      toast({ title: "Connection failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="flex flex-col items-center mb-8 gap-3">
          <ThreadFlowLogoSquare className="w-14 h-14" />
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Connect Threads Account</h1>
            <p className="text-sm text-muted-foreground mt-1">Link your Meta Threads account to start posting</p>
          </div>
        </div>

        {connected ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 gap-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <p className="text-lg font-semibold text-foreground">Connected!</p>
              <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">API Credentials</CardTitle>
              <CardDescription>
                Get these from{" "}
                <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1">
                  Meta Developer Portal <ExternalLink className="w-3 h-3" />
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="threadsAccessToken" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Threads Access Token <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Your long-lived access token" data-testid="input-access-token" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Go to Meta Developer Portal → Your App → Threads API → Generate Token
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="threadsAppId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>App ID <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Your Meta App ID" data-testid="input-app-id" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Found in your app's Settings → Basic → App ID
                      </FormDescription>
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="threadsAppSecret" render={({ field }) => (
                    <FormItem>
                      <FormLabel>App Secret <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Your Meta App Secret" data-testid="input-app-secret" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Found in your app's Settings → Basic → App Secret
                      </FormDescription>
                    </FormItem>
                  )} />

                  <div className="flex gap-3 pt-2">
                    <Button type="submit" className="flex-1" disabled={loading} data-testid="button-connect">
                      <Link2 className="w-4 h-4 mr-2" />
                      {loading ? "Connecting..." : "Connect Account"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setLocation("/")}
                      data-testid="button-skip"
                    >
                      <SkipForward className="w-4 h-4 mr-1" />
                      Skip
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
