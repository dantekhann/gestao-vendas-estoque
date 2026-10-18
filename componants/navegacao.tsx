"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/", label: "Início" },
  { href: "/produtos", label: "Produtos" },
  { href: "/vendas/lancar", label: "Lançar Venda" },
  { href: "/vendas", label: "Vendas" },
  { href: "/movimentar", label: "Movimentar" },
  { href: "/movimentacoes", label: "Movimentações" },
  { href: "/producao", label: "Produção" },
  { href: "/inventario/whatsapp", label: "Inventário WhatsApp" },
];

export default function Navegacao() {
  const pathname = usePathname();

  // Sem menu na tela de login
  if (pathname === "/login") return null;

  return (
    <nav className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-900">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-2">
        {ITENS.map((item) => {
          const ativo = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                ativo
                  ? "bg-amber-600 text-white"
                  : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
