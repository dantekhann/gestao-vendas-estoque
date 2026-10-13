import { describe, it, expect } from 'vitest'
import {
  normalizarTextoGeral,
  extrairQuantidadeComExtenso,
  formatarTitleCase,
  sugerirNomeOficial,
  parsearInventario,
  restaurarAcentos,
  type ProdutoInput,
} from './parser-inventario'

describe('normalizarTextoGeral', () => {
  it('remove acentos e espaços das pontas', () => {
    expect(normalizarTextoGeral('  Água Sanitária  ')).toBe('agua sanitaria')
  })
})

describe('restaurarAcentos', () => {
  it('restaura acentos do aroma (limao → Limão)', () => {
    expect(restaurarAcentos('capim limao')).toBe('Capim Limão')
  })
  it('mantém palavras fora do dicionário', () => {
    expect(restaurarAcentos('menta')).toBe('menta')
  })
})

describe('extrairQuantidadeComExtenso', () => {
  it('lê número com vírgula decimal e arredonda (1,5 → 2)', () => {
    expect(extrairQuantidadeComExtenso('1,5 gel')).toEqual({ quantidade: 2, textoRestante: 'gel' })
  })
  it('lê "2 mil"', () => {
    expect(extrairQuantidadeComExtenso('2 mil sacos')).toEqual({ quantidade: 2000, textoRestante: 'sacos' })
  })
  it('lê "metade" como 1 e consome a unidade (pct)', () => {
    expect(extrairQuantidadeComExtenso('metade pct bolados')).toEqual({ quantidade: 1, textoRestante: 'bolados' })
  })
  it('retorna 0 quando não há número', () => {
    expect(extrairQuantidadeComExtenso('gel').quantidade).toBe(0)
  })
})

describe('formatarTitleCase', () => {
  it('mantém conectivos em minúscula', () => {
    expect(formatarTitleCase('saco de lixo grande')).toBe('Saco de Lixo Grande')
  })
})

describe('sugerirNomeOficial (apelidos)', () => {
  it('velcro é reconhecido', () => {
    expect(sugerirNomeOficial('velcro', 'velcro')).toBe('Velcro (pares)')
  })
  it('frasco sem diluente vira Diluente Frasco', () => {
    expect(sugerirNomeOficial('frasco 1l', 'frasco 1l')).toBe('Diluente Frasco')
  })
  it('diluente com frasco vira Diluente Frasco', () => {
    expect(sugerirNomeOficial('diluente frasco', 'diluente frasco')).toBe('Diluente Frasco')
  })
  it('essencia X vira Essência Desmarola X', () => {
    expect(sugerirNomeOficial('essencia cravo', 'essencia cravo')).toBe('Essência Desmarola Cravo')
  })
  it('essencia com aroma composto mantém o composto com acento', () => {
    expect(sugerirNomeOficial('essencia capim limao', 'essencia capim limao')).toBe('Essência Desmarola Capim Limão')
  })
  it('essencia sem aroma cai em Desconhecida', () => {
    expect(sugerirNomeOficial('essencia', 'essencia')).toBe('Essência Desmarola Desconhecida')
  })
})

describe('parsearInventario', () => {
  const produtos: ProdutoInput[] = [
    { id: 'p1', nome: 'Gel', estoque_atual: 10 },
    { id: 'p2', nome: 'Master Yerba', estoque_atual: 5 },
    { id: 'p3', nome: 'Diluente (%)', estoque_atual: 3 },
  ]

  it('casa item simples com produto (geo → gel)', () => {
    const r = parsearInventario('geo: 3', produtos)
    expect(r).toHaveLength(1)
    expect(r[0].produto_id).toBe('p1')
    expect(r[0].quantidade_contada).toBe(3)
    expect(r[0].encontrado).toBe(true)
    expect(r[0].diferenca).toBe(-7)
  })

  it('consolida duplicatas somando', () => {
    const r = parsearInventario('gel: 3\ngel: 2', produtos)
    expect(r).toHaveLength(1)
    expect(r[0].quantidade_contada).toBe(5)
  })

  it('marca item não encontrado com produto_id indefinido', () => {
    const r = parsearInventario('produto inexistente: 2', produtos)
    expect(r[0].encontrado).toBe(false)
    expect(r[0].produto_id).toBeUndefined()
  })

  it('ignora linhas de cabeçalho e vazias', () => {
    const r = parsearInventario('Atualização Estoque\n\ngel: 1\nEstoque atual:', produtos)
    expect(r).toHaveLength(1)
  })

  it('processa linha composta com +', () => {
    const r = parsearInventario('2 + gel: 1', produtos)
    expect(r.length).toBeGreaterThanOrEqual(1)
  })

  it('essencia no texto completo vira Essência Desmarola', () => {
    const r = parsearInventario('essencia capim: 2', produtos)
    expect(r[0].nomeCatalogo).toBe('Essência Desmarola Capim')
  })
})