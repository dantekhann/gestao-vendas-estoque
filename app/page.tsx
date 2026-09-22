'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Produto {
  id: string;
  sku: string;
  nome: string;
  preco_venda: number;
  estoque_atual: number;
}

export default function DashboardPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregarDashboard() {
      setCarregando(true);
      const { data, error } = await supabase
        .from('produtos')
        .select('id, sku, nome, preco_venda, estoque_atual')
        .order('nome');

      if (!error && data) {
        setProdutos(data);
      }
      setCarregando(false);
    }
    carregarDashboard();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Topo / Cabeçalho */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400">OrC Brasil — Gestão de Stock e Vendas</h1>
            <p className="text-xs text-slate-400">Painel Principal / Dashboard</p>
          </div>
          <Link
            href="/vendas/nova"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors shadow-lg shadow-emerald-950/50"
          >
            + Registar Nova Venda
          </Link>
        </div>

        {/* Resumo de Indicadores */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <p className="text-xs text-slate-400">Total de Produtos em Catálogo</p>
            <p className="text-2xl font-bold font-mono text-slate-100 mt-1">{produtos.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <p className="text-xs text-slate-400">Produtos em Alerta de Stock (&le; 10)</p>
            <p className="text-2xl font-bold font-mono text-amber-400 mt-1">
              {produtos.filter((p) => p.estoque_atual <= 10).length}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <p className="text-xs text-slate-400">Produtos Esgotados</p>
            <p className="text-2xl font-bold font-mono text-red-400 mt-1">
              {produtos.filter((p) => p.estoque_atual <= 0).length}
            </p>
          </div>
        </div>

        {/* Tabela de Produtos / Stock */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Visão Geral do Stock de Produtos
          </h2>

          {carregando ? (
            <p className="text-xs text-slate-500 py-6 text-center">A carregar produtos do banco de dados...</p>
          ) : produtos.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">Nenhum produto cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Produto</th>
                    <th className="py-3 px-4">Preço Venda</th>
                    <th className="py-3 px-4">Stock Atual</th>
                    <th className="py-3 px-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {produtos.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono text-slate-400">{p.sku}</td>
                      <td className="py-3 px-4 font-semibold text-slate-200">{p.nome}</td>
                      <td className="py-3 px-4 font-mono text-emerald-400">
                        R$ {Number(p.preco_venda).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-100">{p.estoque_atual}</td>
                      <td className="py-3 px-4">
                        {p.estoque_atual <= 0 ? (
                          <span className="bg-red-500/10 text-red-400 px-2 py-0.5 rounded text-[10px] font-semibold border border-red-500/20">
                            Esgotado
                          </span>
                        ) : p.estoque_atual <= 10 ? (
                          <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded text-[10px] font-semibold border border-amber-500/20">
                            Stock Baixo
                          </span>
                        ) : (
                          <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold border border-emerald-500/20">
                            Em Stock
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}