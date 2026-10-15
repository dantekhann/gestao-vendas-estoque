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

// Calcula a diferença (contado − estoque atual) para a coluna da pré-visualização
function calcularDiferenca(item: ItemProcessado, produtos: Produto[]) {
  if (!item.encontrado || !item.produto_id) {
    return { texto: `+${item.quantidade_contada}`, classe: 'text-amber-400', sub: 'novo item' };
  }
  const produto = produtos.find((p) => p.id === item.produto_id);
  const tinha = produto?.estoque_atual ?? 0;
  const dif = item.quantidade_contada - tinha;
  if (dif === 0) {
    return { texto: '±0', classe: 'text-slate-500', sub: `tinha ${tinha}` };
  }
  const sinal = dif > 0 ? '+' : '−';
  const classe = dif > 0 ? 'text-emerald-400' : 'text-red-400';
  return { texto: `${sinal}${Math.abs(dif)}`, classe, sub: `tinha ${tinha}` };
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
      const payload = itensProcessados.map((item) => ({
        produto_id: item.produto_id ?? null,
        nomeCatalogo: item.nomeCatalogo,
        quantidade_contada: Math.round(item.quantidade_contada),
      }));
      const { data, error } = await supabase.rpc('aplicar_inventario', {
        itens: payload,
      });
      if (error) throw error;
      const criados = (data ?? []).filter((r: any) => r.criado).length;
      alert(`Inventário aplicado com sucesso! (${itensProcessados.length - criados} atualizados, ${criados} criados)`);
      router.push('/produtos');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Erro ao aplicar inventário:', msg);
      setErro(msg);
      alert(`Erro ao aplicar inventário: ${msg}`);
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
                    <th className="p-3 text-center">Diferença</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {itensProcessados.map((item, idx) => {
                    const dif = calcularDiferenca(item, produtos);
                    return (
                      <tr key={idx} className="hover:bg-slate-800/50">
                        <td className="p-3 text-slate-400 text-xs">{item.nomeOriginal}</td>
                        <td className="p-3 font-medium text-slate-200">
                          {item.nomeCatalogo}
                          {!item.encontrado && (
                            <span className="block text-xs text-amber-400">Novo item criado automaticamente</span>
                          )}
                        </td>
                        <td className="p-3 text-center font-bold text-emerald-400">{item.quantidade_contada}</td>
                        <td className="p-3 text-center">
                          <span className={`font-bold ${dif.classe}`}>{dif.texto}</span>
                          <span className="block text-xs text-slate-500">{dif.sub}</span>
                        </td>
                      </tr>
                    );
                  })}
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