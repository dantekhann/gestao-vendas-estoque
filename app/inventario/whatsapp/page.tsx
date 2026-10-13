'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parsearInventario, type ItemProcessado } from '@/lib/parser-inventario'

interface Produto {
  id: string;
  nome: string;
  estoque_atual: number;
}

export default function InventarioWhatsAppPage() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const supabase = createClient()
  const [textoWhatsApp, setTextoWhatsApp] = useState<string>('');
  const [itensProcessados, setItensProcessados] = useState<ItemProcessado[]>([]);
  const [carregando, setCarregando] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregarProdutos() {
      try {
        setCarregando(true);
        const { data, error } = await supabase
          .from('produtos')
          .select('id, nome, estoque_atual')
          .order('nome', { ascending: true })
          .range(0, 999);
        if (error) throw error;
        if (data) setProdutos(data);
      } catch (err: unknown) {
        const errObj = err as Record<string, unknown>;
        setErro((errObj?.message as string) || 'Erro ao carregar produtos.');
      } finally {
        setCarregando(false);
      }
    }
    carregarProdutos();
  }, [supabase]);

  const processarTexto = () => {
    if (!textoWhatsApp.trim()) {
      alert('Cole o texto da lista do WhatsApp primeiro.');
      return;
    }
    setItensProcessados(parsearInventario(textoWhatsApp, produtos));
  };

  const aplicarInventario = async () => {
    if (itensProcessados.length === 0) return;
    try {
      setSalvando(true);
      setErro(null);
      const dataHoje = new Date().toISOString().split('T')[0];
      for (const item of itensProcessados) {
        let produtoId = item.produto_id;
        const qtdInteira = Math.round(item.quantidade_contada);
        const diferencaInteira = Math.round(item.diferenca);
        if (!item.encontrado || !produtoId) {
          const { data: novoProd, error: errCriacao } = await supabase
            .from('produtos')
            .insert([{ nome: item.nomeCatalogo, estoque_atual: qtdInteira }])
            .select('id')
            .single();
          if (errCriacao) throw errCriacao;
          produtoId = novoProd.id;
        } else {
          const { error: prodError } = await supabase
            .from('produtos')
            .update({ estoque_atual: qtdInteira })
            .eq('id', produtoId);
          if (prodError) throw prodError;
        }
        const { error: movError } = await supabase.from('movimentacoes').insert([
          {
            produto_id: produtoId,
            tipo: 'AJUSTE',
            quantidade: Math.abs(diferencaInteira),
            observacao: `Inventário WhatsApp (Anterior: ${item.estoque_antigo} -> Novo: ${qtdInteira})`,
            created_at: `${dataHoje}T12:00:00.000Z`,
          },
        ]);
        if (movError) throw movError;
      }
      alert('Inventário aplicado com sucesso aos produtos oficiais!');
      router.push('/produtos');
      router.refresh();
    } catch (err: unknown) {
      console.error('Erro detalhado do Supabase:', err);
      const errObj = err as Record<string, unknown>;
      const mensagemErro = (errObj?.message as string) || (errObj?.error_description as string) || JSON.stringify(err);
      setErro(mensagemErro);
      alert(`Erro ao salvar no Supabase: ${mensagemErro}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Inventário Rápido via WhatsApp</h1>
            <p className="text-sm text-slate-400">Mapeamento Inteligente com Prevenção de Duplicados</p>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
          >
            ← Voltar
          </button>
        </div>

        {erro && (
          <div className="p-4 border border-red-500/30 bg-red-950/50 text-red-400 rounded-lg text-sm">
            {erro}
          </div>
        )}

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Cole a lista completa do WhatsApp aqui:
          </label>
          <textarea
            rows={10}
            placeholder="Cole toda a lista aqui..."
            value={textoWhatsApp}
            onChange={(e) => setTextoWhatsApp(e.target.value)}
            className="w-full p-3.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
          <button
            type="button"
            onClick={processarTexto}
            disabled={carregando}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer shadow-sm"
          >
            {carregando ? 'A carregar...' : '🔍 Processar e Normalizar Lista'}
          </button>
        </div>

        {itensProcessados.length > 0 && (
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
            <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Pré-visualização do Mapeamento ({itensProcessados.length} itens únicos)
            </h2>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-slate-400 uppercase text-xs border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="p-3">Texto Original (WhatsApp)</th>
                    <th className="p-3">Nome Normalizado no Sistema</th>
                    <th className="p-3 text-center">Contagem Consolidada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {itensProcessados.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/50">
                      <td className="p-3 text-slate-400 text-xs">{item.nomeOriginal}</td>
                      <td className="p-3 font-medium text-slate-200">
                        {item.nomeCatalogo}
                        {!item.encontrado && (
                          <span className="block text-xs text-amber-400">Novo item criado automaticamente</span>
                        )}
                      </td>
                      <td className="p-3 text-center font-bold text-emerald-400">{item.quantidade_contada}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={aplicarInventario}
              disabled={salvando}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors shadow-lg disabled:opacity-50 cursor-pointer text-sm uppercase tracking-wider mt-4"
            >
              {salvando ? 'A atualizar inventário oficial...' : 'Confirmar e Atualizar Stock Oficial'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}