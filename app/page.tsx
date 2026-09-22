'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Produto {
  id: string;
  sku: string;
  nome: string;
  preco_venda: number;
  estoque_atual: number;
  tipo: string;
}

export default function DashboardPage() {
  const router = useRouter();

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  // Formata os tipos para exibição na tela (ex: PRODUTO_FINAL -> PRODUTO FINAL)
  const formatarTipo = (tipo: string) => {
    if (!tipo) return '';
    return tipo.replace(/_/g, ' ');
  };

  useEffect(() => {
    let montado = true;

    async function carregarProdutos() {
      try {
        setCarregando(true);
        setErro(null);

        // Busca todos os produtos ordenando pelos maiores estoques no topo
        const { data, error } = await supabase
          .from('produtos')
          .select('id, sku, nome, preco_venda, estoque_atual, tipo')
          .order('estoque_atual', { ascending: false });

        if (error) throw error;

        if (montado && data) {
          setProdutos(data);
        }
      } catch (err: any) {
        console.error('Erro ao carregar estoque:', err);
        if (montado) {
          setErro(err.message || 'Erro ao conectar com o banco de dados.');
        }
      } finally {
        if (montado) {
          setCarregando(false);
        }
      }
    }

    carregarProdutos();

    return () => {
      montado = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
  <button
    onClick={() => router.push('/estoque/movimentar')}
    className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold px-4 py-2.5 rounded-lg border border-slate-700 shadow-sm transition-colors flex items-center gap-2 text-sm"
  >
    <span>📦</span>
    <span>Lançar Entrada/Ajuste</span>
  </button>

  <button
    onClick={() => router.push('/vendas/nova')}
    className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-2 text-sm"
  >
    <span className="text-lg">+</span>
    <span>Nova Venda</span>
  </button>
</div>

        {/* Tabela de Produtos em Tom Escuro */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md">
          {carregando ? (
            <div className="p-8 text-center text-slate-400 animate-pulse font-medium">
              A carregar produtos do banco de dados...
            </div>
          ) : erro ? (
            <div className="p-4 border border-red-500/30 bg-red-950/50 text-red-400 rounded-lg text-sm">
              {erro}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">SKU</th>
                    <th className="p-3.5">Nome</th>
                    <th className="p-3.5">Categoria/Tipo</th>
                    <th className="p-3.5 text-right">Estoque</th>
                    <th className="p-3.5 text-right">Preço de Venda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {produtos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center p-6 text-slate-500 font-medium">
                        Nenhum produto cadastrado no banco de dados.
                      </td>
                    </tr>
                  ) : (
                    produtos.map((produto) => (
                      <tr key={produto.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 font-mono text-xs text-slate-400">{produto.sku}</td>
                        <td className="p-3.5 font-semibold text-slate-100">{produto.nome}</td>
                        <td className="p-3.5 text-xs font-bold">
                          <span className={`px-2.5 py-1 rounded-full ${
                            produto.tipo === 'PRODUTO_FINAL' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' :
                            produto.tipo === 'EMBALAGEM' ? 'bg-amber-950 text-amber-400 border border-amber-800/50' :
                            produto.tipo === 'INSUMO' ? 'bg-blue-950 text-blue-400 border border-blue-800/50' :
                            'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {formatarTipo(produto.tipo)}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-bold text-slate-100">
                          {produto.estoque_atual} un
                        </td>
                        <td className="p-3.5 text-right text-slate-300 font-medium">
                          R$ {produto.preco_venda ? Number(produto.preco_venda).toFixed(2) : '0.00'}
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