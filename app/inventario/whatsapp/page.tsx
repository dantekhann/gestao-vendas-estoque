'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Produto {
  id: string;
  nome: string;
  estoque_atual: number;
}

interface ItemProcessado {
  produto_id?: string;
  nomeOriginal: string;
  nomeCatalogo: string;
  estoque_antigo: number;
  quantidade_contada: number;
  diferenca: number;
  encontrado: boolean;
}

export default function InventarioWhatsAppPage() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [textoWhatsApp, setTextoWhatsApp] = useState<string>('');
  const [itensProcessados, setItensProcessados] = useState<ItemProcessado[]>([]);
  const [carregando, setCarregando] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    carregarProdutos();
  }, []);

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

  const extrairQuantidadeComExtenso = (texto: string): { quantidade: number; textoRestante: string } => {
    let textoLower = texto.toLowerCase().trim();
    let multiplicadorFator = 1;

    if (textoLower.startsWith('meio') || textoLower.startsWith('metade') || textoLower.startsWith('1/2')) {
      multiplicadorFator = 0.5;
      textoLower = textoLower.replace(/^(?:meio|metade|1\/2)\s*(?:pct|pacote|cx|caixa|un|de)?\s*/i, '').trim();
      texto = texto.replace(/^(?:meio|metade|1\/2)\s*(?:pct|pacote|cx|caixa|un|de)?\s*/i, '').trim();
    }

    const matchMil = textoLower.match(/^([\d\.,]+)\s*(mil|k)\b/);
    if (matchMil) {
      const numStr = matchMil[1].replace(/\./g, '').replace(',', '.');
      const baseNum = parseFloat(numStr);
      if (!isNaN(baseNum)) {
        return { quantidade: Math.round(baseNum * 1000 * multiplicadorFator), textoRestante: texto.replace(matchMil[0], '').trim() };
      }
    }

    const matchNum = texto.match(/^([\d\.]+(?:,\d+)?)/);
    if (matchNum) {
      const numStr = matchNum[0].replace(/\./g, '').replace(',', '.');
      const val = parseFloat(numStr);
      if (!isNaN(val)) {
        return { quantidade: Math.round(val * multiplicadorFator), textoRestante: texto.replace(matchNum[0], '').trim() };
      }
    }

    if (multiplicadorFator !== 1) {
      return { quantidade: Math.round(multiplicadorFator), textoRestante: texto };
    }

    return { quantidade: 0, textoRestante: texto };
  };

  const formatarTitleCase = (str: string): string => {
    const ignorarMinusculas = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com'];
    return str
      .toLowerCase()
      .split(' ')
      .map((palavra, index) => {
        if (!palavra) return '';
        if (index > 0 && ignorarMinusculas.includes(palavra)) {
          return palavra;
        }
        return palavra.charAt(0).toUpperCase() + palavra.slice(1);
      })
      .join(' ')
      .trim();
  };

  const normalizarTextoGeral = (str: string) => 
    str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const processarTexto = () => {
    if (!textoWhatsApp.trim()) {
      alert('Cole o texto da lista do WhatsApp primeiro.');
      return;
    }

    const linhas = textoWhatsApp.split('\n');
    const resultados: ItemProcessado[] = [];

    const adicionarItemProcessado = (textoOrig: string, qtd: number, txtProd: string) => {
      if (isNaN(qtd)) qtd = 0;
      qtd = Math.round(qtd);
      if (!txtProd || txtProd.length < 2) return;

      let textoCorrigido = txtProd.replace(/\bgeo\b/gi, 'gel');

      let textoTratado = textoCorrigido
        .replace(/^(?:\d+\s*)?(?:kg|l|pct|pacote|ml|gr|g|un|cxs|cx)\b\.?/gi, '')
        .replace(/\b(?:pct|pacote|kg|ml|cxs|cx|un|rolos|bags|frascos|und)\b\.?/gi, '')
        .replace(/(?:\b\d+[\d\.,]*\s*)?\b[lL]\b\.?(?=\s|$)/g, '')
        .replace(/^\d+/, '')
        .replace(/\s+/g, ' ')
        .trim();

      const tNorm = normalizarTextoGeral(textoTratado);
      const tOrigLower = normalizarTextoGeral(textoOrig);

      let nomeOficialSugerido = '';

      if (tNorm.includes('master yerba') || tNorm.includes('emb. yerba') || tNorm.includes('embalagem yerba') || tNorm.includes('master de yerba') || tNorm === 'master yerba' || tNorm.includes('emb yerba')) {
        nomeOficialSugerido = 'Master Yerba';
      } else if (tNorm.includes('master yerbinha') || tNorm.includes('emb. yerbinha') || tNorm.includes('embalagem yerbinha') || tNorm.includes('master de yerbinha') || tNorm === 'master yerbinha' || tNorm.includes('emb yerbinha')) {
        nomeOficialSugerido = 'Master Yerbinha';
      } else if (tNorm.includes('master de bolados') || tNorm.includes('master bolados') || tNorm.includes('emb. bolados')) {
        nomeOficialSugerido = 'Master de Bolados';
      } else if (tNorm.includes('display bolados')) {
        nomeOficialSugerido = 'Display Bolados';
      } else if (tNorm.includes('pote') && tNorm.includes('bolado')) {
        nomeOficialSugerido = 'Pote/100 bolados';
      } else if (tNorm.includes('diluente') || tNorm.includes('%') || tOrigLower.includes('%')) {
        if (tNorm.includes('frasco') || tOrigLower.includes('frasco')) {
          nomeOficialSugerido = 'Diluente Frasco';
        } else {
          nomeOficialSugerido = 'Diluente (%)';
        }
      } else if (tNorm.includes('frasco')) {
        nomeOficialSugerido = 'Diluente Frasco';
      } else if (tNorm.includes('velcro')) {
        nomeOficialSugerido = 'Velcro (pares)';
      } else if (tNorm.includes('copo descartavel') || tNorm.includes('copo')) {
        nomeOficialSugerido = 'Copo Descartável';
      } else if (tNorm.includes('tinta')) {
        nomeOficialSugerido = 'Tinta (%)';
      } else if (tNorm.includes('sabao liquido') || tNorm.includes('sabao gel')) {
        nomeOficialSugerido = 'Sabão Líquido';
      } else if (tNorm.includes('saco de lixo pequeno') || tNorm.includes('lixo pequeno')) {
        nomeOficialSugerido = 'Saco de Lixo Pequeno';
      } else if (tNorm.includes('saco de lixo grande') || tNorm.includes('lixo grande')) {
        nomeOficialSugerido = 'Saco de Lixo Grande';
      } else if (tNorm.includes('essencia')) {
        if (tNorm.includes('capim')) nomeOficialSugerido = 'Essência Capim Limão';
        else if (tNorm.includes('cravo')) nomeOficialSugerido = 'Essência Cravo (KG)';
        else if (tNorm.includes('bambu')) nomeOficialSugerido = 'Essência Bambu';
        else if (tNorm.includes('doce')) nomeOficialSugerido = 'Essência Doce Utopia';
        else if (tNorm.includes('flor')) nomeOficialSugerido = 'Essência Flor de Laranjeira';
        else nomeOficialSugerido = 'Essência ' + formatarTitleCase(textoTratado.replace(/essencia/gi, '').trim());
      } else if (tNorm.startsWith('rot.') || tNorm.startsWith('rot') || tNorm.includes('rotulo')) {
        if (tNorm.includes('bambu')) nomeOficialSugerido = 'Rótulo Desmarola Bambu';
        else if (tNorm.includes('capim')) nomeOficialSugerido = 'Rótulo Desmarola Capim Limão';
        else if (tNorm.includes('cravo')) nomeOficialSugerido = 'Rótulo Desmarola Cravo';
        else if (tNorm.includes('doce')) nomeOficialSugerido = 'Rótulo Desmarola Doce Utopia';
        else if (tNorm.includes('flor')) nomeOficialSugerido = 'Rótulo Desmarola Flor de Laranjeira';
        else nomeOficialSugerido = formatarTitleCase(textoTratado);
      } else if (tNorm.includes('agua sanitaria')) {
        nomeOficialSugerido = 'Água Sanitária (L)';
      } else if (tNorm.includes('propileno')) {
        nomeOficialSugerido = 'Propileno (L)';
      } else if (tNorm.includes('alcool') && !tNorm.includes('gel')) {
        nomeOficialSugerido = 'Álcool de Limpeza (L)';
      } else if (tNorm.includes('agua desmineralizada')) {
        nomeOficialSugerido = 'Água Desmineralizada (L)';
      } else if (tNorm.includes('desinfetante')) {
        nomeOficialSugerido = 'Desinfetante (L)';
      } else if (tNorm.includes('papel higienico')) {
        nomeOficialSugerido = 'Papel Higiênico (Rolo)';
      } else if (tNorm.includes('luva p')) {
        nomeOficialSugerido = 'Luva P (Pacote)';
      } else if (tNorm.includes('luva m')) {
        nomeOficialSugerido = 'Luva M (Pacote)';
      } else if (tNorm.includes('luva g')) {
        nomeOficialSugerido = 'Luva G (Pacote)';
      } else if (tNorm.includes('prope')) {
        nomeOficialSugerido = 'Propé (Pacote)';
      } else if (tNorm.includes('touca')) {
        nomeOficialSugerido = 'Touca (Pacote)';
      } else if (tNorm.includes('mascara')) {
        nomeOficialSugerido = 'Máscara (Pacote)';
      } else if (tNorm.includes('sabao em po')) {
        nomeOficialSugerido = 'Sabão em Pó (Caixa)';
      } else if (tNorm.includes('detergente') || tNorm.includes('bucha')) {
        nomeOficialSugerido = 'Detergente (Unidade)';
      } else if (tNorm.includes('tabaco a granel') || tNorm.includes('tabaco granel')) {
        nomeOficialSugerido = 'Tabaco a Granel (KG)';
      } else if (tNorm.includes('bom bril') || tNorm.includes('bombril')) {
        nomeOficialSugerido = 'Bom Bril';
      } else {
        nomeOficialSugerido = formatarTitleCase(textoTratado);
      }

      let produtoEncontrado = null;

      if (nomeOficialSugerido) {
        produtoEncontrado = produtos.find(p => normalizarTextoGeral(p.nome) === normalizarTextoGeral(nomeOficialSugerido));
      }

      if (!produtoEncontrado && tNorm.includes('cravo') && tNorm.includes('essencia')) {
        produtoEncontrado = produtos.find(p => {
          const pNorm = normalizarTextoGeral(p.nome);
          return pNorm.includes('essencia') && pNorm.includes('cravo');
        });
      } else if (!produtoEncontrado && (tNorm.includes('rot.') || tNorm.includes('rotulo'))) {
        produtoEncontrado = produtos.find(p => {
          const pNorm = normalizarTextoGeral(p.nome);
          return pNorm.includes('rotulo') && (
            (tNorm.includes('bambu') && pNorm.includes('bambu')) ||
            (tNorm.includes('capim') && pNorm.includes('capim')) ||
            (tNorm.includes('cravo') && pNorm.includes('cravo')) ||
            (tNorm.includes('doce') && pNorm.includes('doce')) ||
            (tNorm.includes('flor') && pNorm.includes('flor'))
          );
        });
      } else if (!produtoEncontrado && tNorm.includes('pote') && tNorm.includes('bolado')) {
        produtoEncontrado = produtos.find(p => {
          const pNorm = normalizarTextoGeral(p.nome);
          return pNorm.includes('pote') && pNorm.includes('bolado');
        });
      }

      if (!produtoEncontrado) {
        produtoEncontrado = produtos.find((p) => {
          const pNorm = normalizarTextoGeral(p.nome);
          return pNorm === tNorm || pNorm.includes(tNorm) || tNorm.includes(pNorm);
        });
      }

      const nomeFinalCatalogo = produtoEncontrado ? produtoEncontrado.nome : nomeOficialSugerido;
      const encontradoOficial = !!produtoEncontrado;
      const nomeFinalNorm = normalizarTextoGeral(nomeFinalCatalogo);

      // Prevenção estrita de duplicados comparando o nome normalizado na lista processada
      const itemExistente = resultados.find((r) => normalizarTextoGeral(r.nomeCatalogo) === nomeFinalNorm);
      
      if (itemExistente) {
        itemExistente.quantidade_contada += qtd;
        itemExistente.diferenca = itemExistente.produto_id 
          ? itemExistente.quantidade_contada - itemExistente.estoque_antigo 
          : itemExistente.quantidade_contada;
      } else {
        resultados.push({
          produto_id: produtoEncontrado?.id,
          nomeOriginal: textoOrig,
          nomeCatalogo: nomeFinalCatalogo,
          estoque_antigo: produtoEncontrado ? produtoEncontrado.estoque_atual : 0,
          quantidade_contada: qtd,
          diferenca: produtoEncontrado ? qtd - produtoEncontrado.estoque_atual : qtd,
          encontrado: encontradoOficial,
        });
      }
    };

    linhas.forEach((linha) => {
      let linhaLimpa = linha.trim();
      if (!linhaLimpa || linhaLimpa.endsWith(':') || linhaLimpa.startsWith('Atualização') || linhaLimpa.startsWith('Estoque')) {
        return; 
      }

      linhaLimpa = linhaLimpa.replace(/^[-*•]\s*/, '');
      let linhaParaProcessar = linhaLimpa.replace(/%%/g, '%');

      if (linhaParaProcessar.includes('+')) {
        const pedacos = linhaParaProcessar.split('+');
        let quantidadePrincipal = 0;
        let textoAposQtdPrincipal = '';

        if (pedacos[0].includes(':')) {
          const partesP1 = pedacos[0].split(':');
          const parteEsq = partesP1[0].trim();
          const parteDir = partesP1.slice(1).join(':').trim();

          const resEsq = extrairQuantidadeComExtenso(parteEsq);
          if (resEsq.quantidade > 0) {
            quantidadePrincipal = resEsq.quantidade;
            textoAposQtdPrincipal = parteDir || resEsq.textoRestante;
          } else {
            const resDir = extrairQuantidadeComExtenso(parteDir);
            quantidadePrincipal = resDir.quantidade;
            textoAposQtdPrincipal = parteEsq;
          }
        } else {
          const resQtd = extrairQuantidadeComExtenso(pedacos[0]);
          quantidadePrincipal = resQtd.quantidade;
          textoAposQtdPrincipal = resQtd.textoRestante;
        }

        adicionarItemProcessado(pedacos[0].trim(), quantidadePrincipal, textoAposQtdPrincipal);

        for (let i = 1; i < pedacos.length; i++) {
          const pedacoAtual = pedacos[i].trim();
          const resQtdPed = extrairQuantidadeComExtenso(pedacoAtual);
          const qtdPed = resQtdPed.quantidade > 0 ? resQtdPed.quantidade : 1; 
          
          const textoFrascoComposto = pedacoAtual.toLowerCase().includes('frasco') && !pedacoAtual.toLowerCase().includes('diluente')
            ? `Diluente ${resQtdPed.textoRestante}`
            : resQtdPed.textoRestante;

          adicionarItemProcessado(pedacoAtual, qtdPed, textoFrascoComposto);
        }
        return;
      }

      let quantidade = 0;
      let textoProduto = '';

      if (linhaParaProcessar.includes(':')) {
        const partes = linhaParaProcessar.split(':');
        const parteQtd = partes[0].trim();
        const restoPartes = partes.slice(1).join(':').trim();
        
        const resQtd = extrairQuantidadeComExtenso(parteQtd);
        if (resQtd.quantidade > 0) {
          quantidade = resQtd.quantidade;
          textoProduto = restoPartes || resQtd.textoRestante;
        } else {
          const resQtdResto = extrairQuantidadeComExtenso(restoPartes);
          if (resQtdResto.quantidade > 0) {
            quantidade = resQtdResto.quantidade;
            textoProduto = parteQtd;
          } else {
            quantidade = resQtdResto.quantidade;
            textoProduto = parteQtd + ' ' + resQtdResto.textoRestante;
          }
        }
      } else {
        const resQtd = extrairQuantidadeComExtenso(linhaParaProcessar);
        quantidade = resQtd.quantidade;
        textoProduto = resQtd.textoRestante;
      }

      adicionarItemProcessado(linhaLimpa, quantidade, textoProduto);
    });

    setItensProcessados(resultados);
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