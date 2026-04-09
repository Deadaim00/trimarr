"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Gauge, ListFilter, Settings2, ListTodo, ScrollText, History, Trash2, ChartColumn } from "lucide-react";

const items = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/statistics", label: "Statistics", icon: ChartColumn },
  { href: "/files", label: "Files", icon: ListFilter },
  { href: "/queue", label: "Queue", icon: ListTodo },
  { href: "/history", label: "History", icon: History },
  { href: "/trash", label: "Trash", icon: Trash2 },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function SidebarNav({ queueCount }: { queueCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link key={item.href} href={item.href} className={clsx("sidebar-link", active && "sidebar-link-active")}>
            <Icon size={17} />
            <span>{item.label}</span>
            {item.href === "/queue" && queueCount > 0 ? <span className="sidebar-badge">{queueCount}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
