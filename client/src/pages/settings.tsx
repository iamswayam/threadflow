import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon, Key, Link2, Trash2, LogOut,
  CheckCircle2, ExternalLink, AlertTriangle, Info,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(8, "Min 8 characters"),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

const connectSchema = z.object({
  threadsAccessToken: z.string().min(1, "Required"),
  threadsAppId: z.string().optional(),
  threadsAppSecret: z.string().optional(),
});

type PasswordForm = z.infer<typeof passwordSchema>;
type ConnectForm = z.infer<typeof connectSchema>;

export default function Settings() {
  const { user, signout, refreshUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const [connectLoading, setConnectLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const connectForm = useForm<ConnectForm>({
    resolver: zodResolver(connectSchema),
    defaultValues: {
      threadsAccessToken: user?.threadsAccessToken || "",
      threadsAppId: "",
      threadsAppSecret: "",
    },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onConnect = async (data: ConnectForm) => {
    setConnectLoading(true);
    try {
      await apiRequest("POST", "/api/auth/connect-threads", data);
      await refreshUser();
      qc.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Threads account updated!", description: "Your credentials have been saved." });
    } catch (err: any) {
      const msg = err.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      toast({ title: "Failed to connect", description: msg, variant: "destructive" });
    } finally {
      setConnectLoading(false);
    }
  };

  const onDisconnect = async () => {
    try {
      await apiRequest("POST", "/api/auth/disconnect-threads", {});
      await refreshUser();
      qc.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Threads disconnected" });
    } catch {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    }
  };

  const onChangePassword = async (data: PasswordForm) => {
    setPasswordLoading(true);
    try {
      await apiRequest("PATCH", "/api/auth/password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast({ title: "Password updated!" });
      passwordForm.reset();
    } catch (err: any) {
      const msg = err.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      toast({ title: "Failed to update", description: msg, variant: "destructive" });
    } finally {
      setPasswordLoading(false);
    }
  };

  const onDeleteAccount = async () => {
    try {
      await apiRequest("DELETE", "/api/auth/account", undefined);
      signout();
      setLocation("/login");
    } catch {
      toast({ title: "Failed to delete account", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and Threads credentials</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              Threads API Credentials
            </CardTitle>
            <CardDescription>
              Update your connection to the Threads API
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${user?.threadsAccessToken ? "bg-status-online" : "bg-status-offline"}`} />
              <span className="text-sm text-muted-foreground">
                {user?.threadsAccessToken ? `Connected as @${user.threadsUsername || "unknown"}` : "Not connected"}
              </span>
              {user?.threadsAccessToken && (
                <Button size="sm" variant="ghost" onClick={onDisconnect} className="ml-auto text-destructive" data-testid="button-disconnect">
                  Disconnect
                </Button>
              )}
            </div>
            <Form {...connectForm}>
              <form onSubmit={connectForm.handleSubmit(onConnect)} className="space-y-4">
                <FormField control={connectForm.control} name="threadsAccessToken" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access Token <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Long-lived access token" data-testid="input-settings-token" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">
                      From{" "}
                      <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-0.5">
                        Meta Developer Portal <ExternalLink className="w-3 h-3" />
                      </a>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={connectForm.control} name="threadsAppId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>App ID <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="Meta App ID" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={connectForm.control} name="threadsAppSecret" render={({ field }) => (
                  <FormItem>
                    <FormLabel>App Secret <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl><Input type="password" placeholder="Meta App Secret" {...field} /></FormControl>
                  </FormItem>
                )} />
                <Button type="submit" disabled={connectLoading} data-testid="button-save-credentials">
                  <Link2 className="w-4 h-4 mr-2" />
                  {connectLoading ? "Saving..." : "Save Credentials"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              Change Password
            </CardTitle>
            <CardDescription>Update your account password</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4">
                <FormField control={passwordForm.control} name="currentPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl><Input type="password" placeholder="Current password" data-testid="input-current-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={passwordForm.control} name="newPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl><Input type="password" placeholder="Min. 8 characters" data-testid="input-new-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={passwordForm.control} name="confirmPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl><Input type="password" placeholder="Re-enter new password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" disabled={passwordLoading} data-testid="button-change-password">
                  <Key className="w-4 h-4 mr-2" />
                  {passwordLoading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            App Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Signed in as</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Version</p>
              <p className="text-xs text-muted-foreground">ThreadFlow v1.0.0</p>
            </div>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary flex items-center gap-1"
            >
              GitHub <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-foreground">License</p>
              <p className="text-xs text-muted-foreground">MIT License — Open Source</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible actions — proceed with caution</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" data-testid="button-delete-account">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your account and all your scheduled posts, bulk queues, and follow-ups. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDeleteAccount}
                  className="bg-destructive text-destructive-foreground"
                  data-testid="button-confirm-delete"
                >
                  Delete Account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
