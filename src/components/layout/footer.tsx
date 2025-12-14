"use client";
import { Copyright, MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function Footer() {
  return (
    <footer className="border-t bg-primary/15">
      <div className="container mx-auto flex flex-col items-center justify-center gap-8 px-4 py-12">
        {/* Logo */}
        <Link className="transition-opacity hover:opacity-80" href="/">
          <Image
            alt="Speisly Logo"
            className="h-auto w-32 rounded-xl shadow-md"
            height={80}
            loading="eager"
            src="/logo_full.png"
            width={200}
          />
        </Link>

        {/* Navigation */}
        <nav className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            className="flex items-center gap-2 text-primary transition-colors hover:text-primary/80"
            href="/"
          >
            <span className="font-medium text-sm">Startseite</span>
          </Link>
          <Separator className="h-4" orientation="vertical" />
          <Link
            className="flex items-center gap-2 text-primary transition-colors hover:text-primary/80"
            href="/kontakt"
          >
            <span className="font-medium text-sm">Kontakt</span>
          </Link>
          <Separator className="h-4" orientation="vertical" />
          <Link
            className="font-medium text-primary text-sm transition-colors hover:text-primary/80"
            href="/datenschutz"
          >
            Datenschutz
          </Link>
        </nav>

        {/* Description */}
        <p className="max-w-2xl px-4 text-center text-muted-foreground text-sm leading-relaxed">
          Dieses Projekt befindet sich noch in der Entwicklung. Es wird ständig
          verbessert und erweitert. Wir freuen uns über Feedback :)
        </p>

        {/* Feedback Button */}
        <Button asChild variant="ghost">
          <Link
            className="flex items-center gap-2 text-primary"
            href="/feedback"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Hilf uns, Speisly zu verbessern!</span>
          </Link>
        </Button>

        {/* Copyright */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <Copyright className="size-4" />
          <span className="text-sm">{new Date().getFullYear()} Speisly</span>
        </div>
      </div>
    </footer>
  );
}
