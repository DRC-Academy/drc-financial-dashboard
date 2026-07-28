"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV = [
  { href: "/resumen", label: "Resumen" },
  { href: "/captacion", label: "Captación" },
  { href: "/captacion-semanal", label: "Captación semanal" },
  { href: "/ingresos", label: "Ingresos" },
  { href: "/retencion", label: "Retención" },
  { href: "/financiera", label: "Financiera" },
  { href: "/producto", label: "Producto" },
];

/**
 * Ruta activa. NO alcanza con startsWith a secas: "/captacion-semanal" empieza
 * con "/captacion" y encendería las dos entradas a la vez. Se exige coincidencia
 * exacta o un separador de ruta detrás, para seguir marcando las sub-rutas.
 */
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="lg:hidden sticky top-0 z-20 bg-drc-green-deep">
      <div className="px-4 pt-4 pb-1 flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-drc-yellow" />
        <span className="text-xs tracking-[0.2em] uppercase text-white/50">
          DRC · Finanzas en vivo
        </span>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 no-scrollbar">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "shrink-0 rounded-full px-3 py-1.5 text-xs whitespace-nowrap",
                active ? "bg-white/15 text-white" : "text-white/60"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
