"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV = [
  { href: "/resumen", label: "Resumen ejecutivo", eyebrow: "01" },
  { href: "/captacion", label: "Captación", eyebrow: "02" },
  { href: "/captacion-semanal", label: "Captación semanal", eyebrow: "02s" },
  { href: "/ingresos", label: "Ingresos", eyebrow: "03" },
  { href: "/retencion", label: "Retención", eyebrow: "04" },
  { href: "/financiera", label: "Situación financiera", eyebrow: "05" },
  { href: "/producto", label: "Producto", eyebrow: "06" },
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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-drc-green-deep text-white/90 min-h-screen sticky top-0">
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-drc-yellow" />
          <span className="text-xs tracking-[0.2em] uppercase text-white/50">
            DRC Academy
          </span>
        </div>
        <h1 className="mt-2 text-xl font-semibold text-white">
          Finanzas <span className="text-drc-yellow">en vivo</span>
        </h1>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white/90"
              )}
            >
              <span
                className={clsx(
                  "tabular text-[11px] w-5 shrink-0",
                  active ? "text-drc-yellow" : "text-white/30"
                )}
              >
                {item.eyebrow}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-6 py-6 text-[11px] text-white/40 leading-relaxed border-t border-white/10">
        Datos leídos en vivo desde el Sheet de KPIs de DRC Academy.
      </div>
    </aside>
  );
}
