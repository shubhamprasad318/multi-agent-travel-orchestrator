"use client";

import { useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, Luggage } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GoogleSignInButton, signOut, useAuthEnabled, useUser } from "@/lib/auth";
import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function PersonAvatar({ person, className }: { person: Pick<Person, "name" | "picture">; className?: string }) {
  return (
    <Avatar className={cn("size-8 border border-paper", className)}>
      {person.picture && <AvatarImage src={person.picture} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-teal text-[11px] font-medium text-paper">{initials(person.name)}</AvatarFallback>
    </Avatar>
  );
}

/** Sign-in dialog body: why to sign in, and Google's button. `compact` drops the explanations. */
export function SignInPrompt({ reason, onDone, compact = false }: { reason?: string; onDone?: () => void; compact?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {!compact && (
        <p className="text-sm text-ink-soft">
          {reason ?? "Keep your trips on every device, plan with friends and save your packing checklist."}
        </p>
      )}
      <GoogleSignInButton onSignedIn={() => onDone?.()} onError={setError} text="continue_with" />
      {error && (
        <p role="alert" className="text-sm text-terracotta">
          {error}
        </p>
      )}
      {!compact && (
        <p className="text-xs text-ink-muted">We only use your name, email and photo. Your trips stay private until you share them.</p>
      )}
    </div>
  );
}

/** Navbar control: "Sign in" or the signed-in user's menu. Hidden when accounts are off. */
export default function AccountMenu({ className }: { className?: string }) {
  const user = useUser();
  const enabled = useAuthEnabled();
  const [open, setOpen] = useState(false);

  if (user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn("rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta", className)}
          aria-label={`Account: ${user.name}`}
        >
          <PersonAvatar person={user} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block text-sm text-ink">{user.name}</span>
            {user.email && <span className="block truncate text-xs text-ink-muted">{user.email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/trips">
              <Luggage className="h-4 w-4" aria-hidden /> My trips
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => signOut()}>
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (!enabled) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn("inline-flex items-center gap-2 text-sm text-ink-soft hover:text-terracotta transition-colors", className)}>
        <LogIn className="h-4 w-4" aria-hidden /> Sign in
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Sign in</DialogTitle>
          <DialogDescription className="sr-only">Sign in with your Google account</DialogDescription>
        </DialogHeader>
        <SignInPrompt onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
