'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface ItemVenda {
  id?: string;
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

export default function EditarVendaPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [cliente, setCliente] = useState<string>('');
  const [formaPagamento, setFormaPagamento] = useState<string>('PIX');
  const [observacoes, setObservacoes] = useState<string>('');
  const [itens, setItens] = useState<ItemVenda[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (id) carregarDetalhesVenda(id);
  }, [id]);

  async function carregarDetalhesVenda(vendaId: string) {
    try {
      setCarregando(true);
      const { data: vendaData, error: vendaError } = await supabase
        .from('vendas')
        .select('*')
        .eq('id', vendaId)
        .single();

      if (vendaError) throw vendaError;

      if (vendaData) {
        setCliente(vendaData.cliente || '');
        setFormaPagamento(vendaData.forma_pagamento || 'PIX');
        setObservacoes(vendaData.observacoes || '');
      }

      const { data: itensData, error: itensError } = await supabase
        .from('itens_venda')
        .select(`
          id,
          produto_id,
          quantidade,
          preco_unitario,
          subtotal,
          produtos (nome)
        `)
        .eq('venda_id', vendaId);

      if (itensError) throw itensError;

      if (itensData) {
        const itensFormatados = itensData.map((item: any) => ({
          id: item.id,
          produto_id: item.produto_id,
          nome: item.produtos?.nome || 'Produto',
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          subtotal: item.subtotal,
        }));
        setItens(itensFormatados);
      }
    } catch (err: any) {
      setErro(err?.message || 'Erro ao carregar dados da venda.');
    } finally {
      setCarregando(false);
    }
  }

  const atualizarItemQuantidade = (produto_id: string, novaQtd: number) => {
    setItens(
      itens.map((item) => {
        if (item.produto_id === produto_id) {
          const q = Math.max(1, novaQtd);
          return {
            ...item,
            quantidade: q,
            subtotal: q * item.preco_unitario,
          };
        }
        return item;
      })
    );
  };

  const atualizarItemPreco = (produto_id: string, novoPreco: number) => {
    setItens(
      itens.map((item) => {
        if (item.produto_id === produto_id) {
          const p = Math.max(0, novoPreco);
          return {
            ...item,
            preco_unitario: p,
            subtotal: item.quantidade * p,
          };
        }
        return item;
      })
    );
  };

  const removerItem = (produto_id: string) => {
    setItens(itens.filter((i) => i.produto_id !== produto_id));
  };

  const subtotalGeral = itens.reduce((acc, item) => acc + item.subtotal, 0);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itens.length === 0) {
      alert('A venda precisa conter pelo menos um item.');
      return;
    }

    try {
      setSalvando(true);
      setErro(null);

      const { error: updateError } = await supabase
        .from('vendas')
        .update({
          cliente,
          forma_pagamento: formaPagamento,
          observacoes,
          valor_total: subtotalGeral,
        })
        .eq('id', id);

      if (updateError) throw updateError;

      await supabase.from('itens_venda').delete().eq('venda_id', id);

      for (const item of itens) {
        const { error: insertItemError } = await supabase
          .from('itens_venda')
          .insert([
            {
              venda_id: id,
              produto_id: item.produto_id,
              quantidade: item.quantidade,
              preco_unitario: item.preco_unitario,
              subtotal: item.subtotal,
            },
          ]);
        if (insertItemError) throw insertItemError;
      }

      alert('Venda atualizada com sucesso!');
      router.push('/vendas');
      router.refresh();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao atualizar venda.');
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirVenda = async () => {
    if (!confirm('Tem certeza de que deseja excluir esta venda permanentemente?')) return;

    try {
      setSalvando(true);
      await supabase.from('itens_venda').delete().eq('venda_id', id);
      
      const { error } = await supabase.from('vendas').delete().eq('id', id);
      if (error) throw error;

      alert('Venda excluída com sucesso.');
      router.push('/vendas');
      router.refresh();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao excluir venda.');
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400">A carregar dados da venda...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Editar Venda</h1>
            <p className="text-sm text-slate-400">ID: {id}</p>
          </div>
          <button
            onClick={() => router.push('/vendas')}
            className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 cursor-pointer"
          >
            ← Voltar
          </button>
        </div>

        <form onSubmit={handleSalvar} className="space-y-6">
          {erro && (
            <div className="p-4 border border-red-500/30 bg-red-950/50 text-red-400 rounded-lg text-sm">
              {erro}
            </div>
          )}

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Informações da Venda</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Cliente</label>
                <input
                  type="text"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Forma de Pagamento</label>
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="OUTROS">Outros</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Observações</label>
              <textarea
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-3">
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Itens da Venda</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-slate-400 uppercase text-xs border-b border-slate-800">
                  <tr>
                    <th className="p-3">PRODUTO</th>
                    <th className="p-3 text-center">QTD</th>
                    <th className="p-3 text-right">PREÇO UNIT. (R$)</th>
                    <th className="p-3 text-right">SUBTOTAL</th>
                    <th className="p-3 text-center">AÇÃO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {itens.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500 text-xs uppercase">
                        Nenhum item nesta venda.
                      </td>
                    </tr>
                  ) : (
                    itens.map((item) => (
                      <tr key={item.produto_id} className="hover:bg-slate-800/50">
                        <td className="p-3 font-medium text-slate-200">{item.nome}</td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min="1"
                            value={item.quantidade}
                            onChange={(e) => atualizarItemQuantidade(item.produto_id, parseInt(e.target.value) || 1)}
                            className="w-20 p-1.5 border border-slate-700 rounded bg-slate-950 text-slate-100 text-center text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="p-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.preco_unitario}
                            onChange={(e) => atualizarItemPreco(item.produto_id, parseFloat(e.target.value) || 0)}
                            className="w-28 p-1.5 border border-slate-700 rounded bg-slate-950 text-emerald-400 font-semibold text-right text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="p-3 text-right font-semibold text-emerald-400">
                          R$ {item.subtotal.toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => removerItem(item.produto_id)}
                            className="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 bg-rose-950/40 rounded border border-rose-900/50 cursor-pointer"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-4 text-right">
              <div className="text-2xl font-bold text-emerald-400">
                Total: R$ {subtotalGeral.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors shadow-lg disabled:opacity-50 cursor-pointer text-sm uppercase tracking-wider"
            >
              {salvando ? 'A guardar...' : 'Guardar Alterações'}
            </button>
            
            <button
              type="button"
              onClick={handleExcluirVenda}
              disabled={salvando}
              className="px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl transition-colors shadow-lg disabled:opacity-50 cursor-pointer text-sm uppercase tracking-wider"
            >
              Excluir Venda
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}