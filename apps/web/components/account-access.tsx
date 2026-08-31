"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LogIn, LogOut, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function AccountAccess({
  locale,
  currentEmail,
  onClose,
  onSignedOut
}: {
  locale: "zh-CN" | "en";
  currentEmail: string | undefined;
  onClose: () => void;
  onSignedOut: () => void;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const zh = locale === "zh-CN";

  useEffect(() => {
    emailRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  async function signIn() {
    const client = createSupabaseBrowserClient();
    if (!client) {
      setMessage(zh ? "尚未配置 Supabase；当前继续使用本地游客模式。" : "Supabase is not configured; guest mode remains active.");
      return;
    }
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    setMessage(error ? error.message : zh ? "登录链接已发送。" : "Sign-in link sent.");
  }

  async function signOut() {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) {
      setMessage(error.message);
      return;
    }
    onSignedOut();
    onClose();
  }

  return (
    <div className="account-popover" role="dialog" aria-label={zh ? "邮箱登录" : "Email sign in"}>
      <button className="icon-button account-close" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><X size={16} /></button>
      <span className="eyebrow">{zh ? "私有云项目" : "PRIVATE CLOUD PROJECTS"}</span>
      <h2>{zh ? "邮箱登录" : "Sign in by email"}</h2>
      <p>{currentEmail ? (zh ? `已登录：${currentEmail}` : `Signed in: ${currentEmail}`) : (zh ? "登录项目由 Supabase RLS 隔离；游客项目仍只保存在本浏览器。" : "Signed-in projects are isolated by Supabase RLS; guest projects stay in this browser.")}</p>
      {!currentEmail && <><label>
        <span>Email</span>
        <input ref={emailRef} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="researcher@example.org" />
      </label>
      <button className="primary-button" onClick={signIn} disabled={!email.includes("@")}><LogIn size={16} />{zh ? "发送登录链接" : "Send sign-in link"}</button></>}
      {currentEmail && <button className="quiet-button" onClick={signOut}><LogOut size={16} />{zh ? "退出登录" : "Sign out"}</button>}
      {message && <p className="form-message" role="status">{message}</p>}
    </div>
  );
}
