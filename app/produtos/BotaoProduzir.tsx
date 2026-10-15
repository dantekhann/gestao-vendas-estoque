'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Produto { id: string; nome: string; estoque_atual: number; }
interface Receita { display_id: string; insumo_id: string; quantidade: number; }

// Velcro vive em pares: traduz para pacotes + soltos na exibição
function textoConsumo(nome: string, consumo: number): string {
  if (nome.toLowerCase().includes('pares')) {
    const pacotes = Math.floor(consumo / 504);
    const soltos = consumo % 504;
    const partes = [
      pacotes > 0 ? `${pacotes} pacote(s)` : null,
      soltos > 0 ? `${soltos} solto(s)` : null,
    ].filter(Boolean).join(' + ');
    return `${consumo} pares (${partes || '0'})`;
  }
  return `${consumo}`;
}

export default function BotaoProduzir() {
  const router = useRouter();
  const supabase = createClient();
  const [aberto, setAberto] = useState(false);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [displayId, setDisplayId] = useState('');
  const [qtd, setQtd] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setErro(''); setSucesso(''); setDisplayId(''); setQtd(1);
    (async () => {
      const [{ data: prods }, { data: recs }] = await Promise.all([
        supabase.from('produtos').select('id, nome, estoque_atual').order('nome'),
        supabase.from('receitas_display').select('display_id, insumo_id, quantidade'),
      ]);
      setProdutos(prods ?? []);
      setReceitas(recs ?? []);
    })();
  }, [aberto]);

  const displays = produtos.filter((p) => receitas.some((r) => r.display_id === p.id));
  const receitaAtual = receitas.filter((r) => r.display_id === displayId);
  const insumo = (id: string) => produtos.find((p) => p.id === id);
  const faltaInsumo = receitaAtual.some(
    (r) => r.quantidade * qtd > (insumo(r.insumo_id)?.estoque_atual ?? 0)
  );

  async function produzir() {
    if (!displayId || qtd < 1) return;
    setCarregando(true); setErro('');
    const { error } = await supabase.rpc('produzir_display', {
      p_display_id: displayId,
      p_quantidade: qtd,
    });
    setCarregando(false);
    if (error) { setErro(error.message); return; }
    setSucesso(`✅ Produção registrada: ${qtd} display(s). Estoque e movimentações atualizados.`);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="px-4 py-2 text-sm font-medium bg-purple-600 text-white hover:bg-purple-500 rounded-lg shadow-sm transition-colors cursor-pointer"
      >
        🏭 Produzir
      </button>

      {aberto && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-white">🏭 Produzir Displays</h2>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Display</label>
              <select
                value={displayId}
                onChange={(e) => setDisplayId(e.target.value)}
                className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Selecione...</option>
                {displays.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome} (estoque: {d.estoque_atual})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Quantidade</label>
              <input
                type="number"
                min={1}
                value={qtd}
                onChange={(e) => setQtd(Number(e.target.value))}
                className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {displayId && receitaAtual.length > 0 && (
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm space-y-1">
                <p className="font-semibold text-slate-300 mb-1">Vai consumir:</p>
                {receitaAtual.map((r) => {
                  const i = insumo(r.insumo_id);
                  const consumo = r.quantidade * qtd;
                  const falta = consumo > (i?.estoque_atual ?? 0);
                  return (
                    <p key={r.insumo_id} className={falta ? 'text-red-400' : 'text-slate-400'}>
                      {i?.nome}: {textoConsumo(i?.nome ?? '', consumo)}
                      {falta ? ' ⚠️ estoque insuficiente' : ` (tem ${i?.estoque_atual})`}
                    </p>
                  );
                })}
              </div>
            )}

            {erro && <p className="text-red-400 text-sm">{erro}</p>}
            {sucesso && <p className="text-emerald-400 text-sm">{sucesso}</p>}

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setAberto(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium cursor-pointer"
              >
                Fechar
              </button>
              <button
                onClick={produzir}
                disabled={!displayId || qtd < 1 || faltaInsumo || carregando || !!sucesso}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer shadow-sm"
              >
                {carregando ? 'Produzindo...' : 'Confirmar Produção'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}