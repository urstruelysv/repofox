"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BranchIcon, GitHubIcon } from "@/components/ui/icons";

import { repositoryUrl, vsixUrl } from "@/lib/repo-links";

export function Navbar() {
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const NAV_LINKS = [
    { label: "Workflow", href: "#pipeline" },
    { label: "Safety", href: "#features" },
    { label: "Source", href: repositoryUrl },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        navScrolled
          ? "bg-white/80 backdrop-blur-xl border-b border-pop-border shadow-sm"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-[1120px] mx-auto px-6 flex items-center h-16 relative">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-sm transition-transform hover:scale-105">
            <BranchIcon className="w-5 h-5" />
          </div>
          <span className="text-[16px] font-bold text-pop-black tracking-tight">
            RepoFox
          </span>
        </Link>

        {/* Links - Centered */}
        <nav className="hidden md:flex items-center gap-9 absolute left-1/2 -translate-x-1/2">
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-[13px] font-semibold text-pop-muted no-underline transition-all hover:text-primary hover:scale-105"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* CTAs */}
        <div className="flex gap-3 items-center ml-auto">
          <a
            href={repositoryUrl}
            className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-pop-border text-[13px] font-medium text-pop-muted no-underline transition-all hover:text-pop-black hover:bg-pop-gray-100"
          >
            <GitHubIcon className="w-4 h-4" /> GitHub
          </a>
          <a
            href={vsixUrl}
            className="pop-button pop-button-primary !py-2 !px-5 !text-[13px] font-bold shadow-sm hover:shadow-md transition-all active:scale-95"
          >
            Download VSIX
          </a>
        </div>
      </div>
    </header>
  );
}
