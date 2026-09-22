'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Venda {
  id: string;
  cliente_nome: string;
  forma_pagamento: string;
  valor_total: number;
  observacao?: string;
}

export default function HistoricoVendasPage() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    async function carregarVendas() {
      try {
        setCarregando(true);
        setErro(null);

        // Seleciona as colunas existentes e ordena pelo ID (decrescente)
        const { data, error } = await supabase
          .from('vendas')
          .select('id, cliente_nome, forma_pagamento, valor_total, observacao')
          .order('id', { ascending: false });

        if (error) {
          throw error;
        }

        if (ativo && data) {
          setVendas(data);
        }
      } catch (err: any) {
        if (ativo) {
          const mensagem = err?.message || 'Erro ao carregar vendas.';
          setErro(mensagem);
        }
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    carregarVendas();

    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Histórico de Vendas</h1>
            <p className="text-sm text-slate-400">Consulta de pedidos lançados - OrC Brasil</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Link
              href="/"
              className="flex-1 sm:flex-none text-center px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              ← Painel Principal
            </Link>
            <Link
              href="/vendas/nova"
              className="flex-1 sm:flex-none text-center px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
            >
              + Nova Venda
            </Link>
          </div>
        </div>

        {/* Tabela de Vendas */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <h2 className="text-lg font-semibold text-slate-200 border-b border-slate-800 pb-2">
            Pedidos Cadastrados
          </h2>

          {carregando ? (
            <div className="p-8 text-center text-slate-400 animate-pulse bg-slate-950/50 rounded-lg border border-slate-800">
              Carregando histórico de vendas...
            </div>
          ) : erro ? (
            <div className="p-4 border border-red-500/30 bg-red-950/50 text-red-400 rounded-lg text-center text-sm">
              {erro}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">Cód. Venda</th>
                    <th className="p-3.5">Cliente</th>
                    <th className="p-3.5">Forma de Pagamento</th>
                    <th className="p-3.5">Observação</th>
                    <th className="p-3.5 text-right">Valor Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {vendas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center p-8 text-slate-500 font-medium">
                        Nenhuma venda registrada até o momento.
                      </td>
                    </tr>
                  ) : (
                    vendas.map((venda) => (
                      <tr key={venda.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 font-mono text-xs text-slate-400">
                          #{String(venda.id).slice(0, 8)}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-100">
                          {venda.cliente_nome || 'Cliente Avulso'}
                        </td>
                        <td className="p-3.5 text-slate-300 text-sm">
                          <span className="px-2.5 py-1 bg-slate-950 rounded border border-slate-800 text-xs font-semibold text-slate-300">
                            {venda.forma_pagamento}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-400 text-sm">
                          {venda.observacao || '—'}
                        </td>
                        <td className="p-3.5 text-right font-bold text-emerald-400 text-base">
                          R$ {venda.valor_total ? Number(venda.valor_total).toFixed(2) : '0.00'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}