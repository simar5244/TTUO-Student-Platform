"use client";

// Floating chat bubble for the public landing page — nudges visitors to sign up
// or log in to chat. Logged-in users get redirected to /portal/messages.
import { useState } from "react";
import Link from "next/link";
import { IconChat, IconX, IconSend } from "./icons";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(!open)} data-track="chat-fab" aria-label="Chat"
        className="fixed bottom-5 right-5 z-50 grid h-13 w-13 place-items-center rounded-full bg-ink p-3.5 text-white shadow-lg transition-transform hover:scale-105">
        {open ? <IconX width={20} height={20} /> : <IconChat width={20} height={20} />}
      </button>
      {open && (
        <div className="fade-up fixed bottom-20 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-line bg-white shadow-2xl">
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mascot/encourage.png" alt="Raider Red" className="h-9 w-9 rounded-full border border-line bg-smoke object-cover object-top" />
              <div>
                <div className="text-sm font-semibold">Questions?</div>
                <div className="text-xs text-mute">Chat with Raider Red or an advisor</div>
              </div>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="max-w-[85%] rounded-lg rounded-bl-sm bg-smoke px-3.5 py-2.5 text-sm">
              Hi! Create an account or sign in to start a conversation — we typically reply within minutes.
            </div>
            <div className="flex gap-2">
              <Link href="/signup" className="flex-1 rounded-md bg-ink py-2.5 text-center text-sm font-medium text-white">Sign up</Link>
              <Link href="/login" className="flex-1 rounded-md border border-line py-2.5 text-center text-sm font-medium">Log in</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
