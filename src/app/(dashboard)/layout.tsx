import { Sidebar } from "@/components/ui/Sidebar";
import { MobileNav } from "@/components/ui/MobileNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <MobileNav />
        <main className="mx-auto max-w-6xl px-5 sm:px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
