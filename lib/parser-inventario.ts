// lib/parser-inventario.ts
// Parser do inventário via WhatsApp — extraído de app/inventario/whatsapp/page.tsx
// Funções PURAS: recebem texto/dados, devolvem resultado. Sem React, sem Supabase.

export interface ProdutoInput {
  id: string
  nome: string
  estoque_atual: number
}

export interface ItemProcessado {
  produto_id?: string
  nomeOriginal: string
  nomeCatalogo: string
  estoque_antigo: number
  quantidade_contada: number
  diferenca: number
  encontrado: boolean
}

export function normalizarTextoGeral(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function extrairQuantidadeComExtenso(texto: string): { quantidade: number; textoRestante: string } {
  let textoLower = texto.toLowerCase().trim();
  let multiplicadorFator = 1;
  if (textoLower.startsWith(',') || textoLower.startsWith('metade') || textoLower.startsWith('1/2')) {
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
}

export function formatarTitleCase(str: string): string {
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
}

// Restaura a grafia oficial (com acentos) das palavras conhecidas do catálogo
const DICIONARIO_ACENTOS: Record<string, string> = {
  'limao': 'Limão',
  'capim': 'Capim',
  'cravo': 'Cravo',
  'bambu': 'Bambu',
  'laranjeira': 'Laranjeira',
  'utopia': 'Utopia',
  'doce': 'Doce',
  'flor': 'Flor',
  'agua': 'Água',
  'sanitaria': 'Sanitária',
  'alcool': 'Álcool',
  'desmineralizada': 'Desmineralizada',
  'essencia': 'Essência',
  'sabao': 'Sabão',
  'higienico': 'Higiênico',
}

export function restaurarAcentos(texto: string): string {
  return texto
    .split(' ')
    .map(palavra => DICIONARIO_ACENTOS[palavra.toLowerCase()] ?? palavra)
    .join(' ')
}

// Mapeamento de apelidos → nome oficial no catálogo (a cadeia de ifs da página)
export function sugerirNomeOficial(textoTratado: string, textoOrig: string): string {
  const tNorm = normalizarTextoGeral(textoTratado);
  const tOrigLower = normalizarTextoGeral(textoOrig);
  if (tNorm.includes('master yerba') || tNorm.includes('emb. yerba') || tNorm.includes('embalagem yerba') || tNorm.includes('master de yerba') || tNorm === 'master yerba' || tNorm.includes('emb yerba')) {
    return 'Master Yerba';
  } else if (tNorm.includes('master yerbinha') || tNorm.includes('emb. yerbinha') || tNorm.includes('embalagem yerbinha') || tNorm.includes('master de yerbinha') || tNorm === 'master yerbinha' || tNorm.includes('emb yerbinha')) {
    return 'Master Yerbinha';
  } else if (tNorm.includes('master de bolados') || tNorm.includes('master bolados') || tNorm.includes('emb. bolados')) {
    return 'Master de Bolados';
  } else if (tNorm.includes('display bolados')) {
    return 'Display Bolados';
  } else if (tNorm.includes('pote') && tNorm.includes('bolado')) {
    return 'Pote/100 bolados';
  } else if (tNorm.includes('diluente') || tNorm.includes('%') || tOrigLower.includes('%')) {
    if (tNorm.includes('frasco') || tOrigLower.includes('frasco')) {
      return 'Diluente Frasco';
    }
    return 'Diluente (%)';
  } else if (tNorm.includes('frasco')) {
    return 'Diluente Frasco';
  } else if (tNorm.includes('velcro')) {
    return 'Velcro (pares)';
  } else if (tNorm.includes('copo descartavel') || tNorm.includes('copo')) {
    return 'Copo Descartável';
  } else if (tNorm.includes('tinta')) {
    return 'Tinta (%)';
  } else if (tNorm.includes('sabao liquido') || tNorm.includes('sabao gel')) {
    return 'Sabão Líquido';
  } else if (tNorm.includes('saco de lixo pequeno') || tNorm.includes('lixo pequeno')) {
    return 'Saco de Lixo Pequeno';
  } else if (tNorm.includes('saco de lixo grande') || tNorm.includes('lixo grande')) {
    return 'Saco de Lixo Grande';
  } else if (tNorm.includes('essencia') || tNorm.startsWith('ess.') || tNorm.startsWith('ess ')) {
    // Padrão oficial: Essência Desmarola X (X = aroma digitado)
    const aromaBruto = textoTratado
      .replace(/ess[êe]ncia/gi, '')
      .replace(/^(?:de\s+)/i, '')
      .replace(/^(?:\d+[\d\.,]*\s*)?(?:kg|l|pct|pacote|ml|gr|g|un)\b\.?\s*/gi, '')
      .trim();
    const aroma = formatarTitleCase(restaurarAcentos(aromaBruto));
    return `Essência Desmarola ${aroma || 'Desconhecida'}`;
  } else if (tNorm.startsWith('rot.') || tNorm.startsWith('rot') || tNorm.includes('rotulo')) {
    if (tNorm.includes('bambu')) return 'Rótulo Desmarola Bambu';
    else if (tNorm.includes('capim')) return 'Rótulo Desmarola Capim Limão';
    else if (tNorm.includes('cravo')) return 'Rótulo Desmarola Cravo';
    else if (tNorm.includes('doce')) return 'Rótulo Desmarola Doce Utopia';
    else if (tNorm.includes('flor')) return 'Rótulo Desmarola Flor de Laranjeira';
    else return formatarTitleCase(textoTratado);
  } else if (tNorm.includes('agua sanitaria')) {
    return 'Água Sanitária (L)';
  } else if (tNorm.includes('propileno')) {
    return 'Propileno (L)';
  } else if (tNorm.includes('alcool') && !tNorm.includes('gel')) {
    return 'Álcool de Limpeza (L)';
  } else if (tNorm.includes('agua desmineralizada')) {
    return 'Água Desmineralizada (L)';
  } else if (tNorm.includes('desinfetante')) {
    return 'Desinfetante (L)';
  } else if (tNorm.includes('papel higienico')) {
    return 'Papel Higiênico (Rolo)';
  } else if (tNorm.includes('luva p')) {
    return 'Luva P (Pacote)';
  } else if (tNorm.includes('luva m')) {
    return 'Luva M (Pacote)';
  } else if (tNorm.includes('luva g')) {
    return 'Luva G (Pacote)';
  } else if (tNorm.includes('prope')) {
    return 'Propé (Pacote)';
  } else if (tNorm.includes('touca')) {
    return 'Touca (Pacote)';
  } else if (tNorm.includes('mascara')) {
    return 'Máscara (Pacote)';
  } else if (tNorm.includes('sabao em po')) {
    return 'Sabão em Pó (Caixa)';
  } else if (tNorm.includes('detergente') || tNorm.includes('bucha')) {
    return 'Detergente (Unidade)';
  } else if (tNorm.includes('tabaco a granel') || tNorm.includes('tabaco granel')) {
    return 'Tabaco a Granel (KG)';
  } else if (tNorm.includes('bom bril') || tNorm.includes('bombril')) {
    return 'Bom Bril';
  }
  return formatarTitleCase(textoTratado);
}

function casarProduto(
  tNorm: string,
  nomeOficialSugerido: string,
  produtos: ProdutoInput[]
): ProdutoInput | null {
  let produtoEncontrado: ProdutoInput | null = null;
  if (nomeOficialSugerido) {
    produtoEncontrado = produtos.find(p => normalizarTextoGeral(p.nome) === normalizarTextoGeral(nomeOficialSugerido)) ?? null;
  }
  if (!produtoEncontrado && tNorm.includes('cravo') && tNorm.includes('essencia')) {
    produtoEncontrado = produtos.find(p => {
      const pNorm = normalizarTextoGeral(p.nome);
      return pNorm.includes('essencia') && pNorm.includes('cravo');
    }) ?? null;
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
    }) ?? null;
  } else if (!produtoEncontrado && tNorm.includes('pote') && tNorm.includes('bolado')) {
    produtoEncontrado = produtos.find(p => {
      const pNorm = normalizarTextoGeral(p.nome);
      return pNorm.includes('pote') && pNorm.includes('bolado');
    }) ?? null;
  }
  if (!produtoEncontrado) {
    produtoEncontrado = produtos.find((p) => {
      const pNorm = normalizarTextoGeral(p.nome);
      return pNorm === tNorm || pNorm.includes(tNorm) || tNorm.includes(pNorm);
    }) ?? null;
  }
  return produtoEncontrado;
}

// Função principal: recebe o texto colado + a lista de produtos, devolve os itens processados
export function parsearInventario(
  texto: string,
  produtos: ProdutoInput[]
): ItemProcessado[] {
  const resultados: ItemProcessado[] = [];

  const adicionarItemProcessado = (textoOrig: string, qtd: number, txtProd: string) => {
    if (isNaN(qtd)) qtd = 0;
    qtd = Math.round(qtd);
    if (!txtProd || txtProd.length < 2) return;
    const textoCorrigido = txtProd.replace(/\bgeo\b/gi, 'gel');
    const textoTratado = textoCorrigido
      .replace(/^(?:\d+\s*)?(?:kg|l|pct|pacote|ml|gr|g|un|cxs|cx)\b\.?/gi, '')
      .replace(/\b(?:pct|pacote|kg|ml|cxs|cx|un|rolos|bags|frascos|und)\b\.?/gi, '')
      .replace(/(?:\b\d+[\d\.,]*\s*)?\b[lL]\b\.?(?=\s|$)/g, '')
      .replace(/^\d+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const tNorm = normalizarTextoGeral(textoTratado);

    const nomeOficialSugerido = sugerirNomeOficial(textoTratado, textoOrig);
    const produtoEncontrado = casarProduto(tNorm, nomeOficialSugerido, produtos);
    const nomeFinalCatalogo = produtoEncontrado ? produtoEncontrado.nome : nomeOficialSugerido;
    const encontradoOficial = !!produtoEncontrado;
    const nomeFinalNorm = normalizarTextoGeral(nomeFinalCatalogo);

    // Prevenção de duplicados: mesmo produto em linhas diferentes soma quantidade
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

  const linhas = texto.split('\n');
  linhas.forEach((linha) => {
    let linhaLimpa = linha.trim();
    if (!linhaLimpa || linhaLimpa.endsWith(':') || linhaLimpa.startsWith('Atualização') || linhaLimpa.startsWith('Estoque')) {
      return;
    }
    linhaLimpa = linhaLimpa.replace(/^[-*•]\s*/, '');
    const linhaParaProcessar = linhaLimpa.replace(/%%/g, '%');

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

  return resultados;
}