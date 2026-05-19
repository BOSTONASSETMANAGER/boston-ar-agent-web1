export const CATEGORIES = [
  'renta-fija',
  'instrumento-del-dia',
  'renta-variable',
  'opciones',
  'earnings',
  'trade-idea',
  'valor-razonable',
  'valor-razonable-extendido',
  'analisis-fundamental',
  'macroeconomicos',
  'sectoriales',
  'cer',
  'lecaps',
  'derivados',
  'prensa',
  'dolar-futuro',
] as const

export type Category = typeof CATEGORIES[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  'renta-fija': 'Renta Fija',
  'instrumento-del-dia': 'Instrumento del Día',
  'renta-variable': 'Renta Variable',
  'opciones': 'Opciones',
  'earnings': 'Earnings',
  'trade-idea': 'Trade Idea',
  'valor-razonable': 'Valor Razonable',
  'valor-razonable-extendido': 'Valor Razonable Extendido',
  'analisis-fundamental': 'Análisis Fundamental',
  'macroeconomicos': 'Macroeconómicos',
  'sectoriales': 'Sectoriales',
  'cer': 'CER',
  'lecaps': 'LECAPs',
  'derivados': 'Derivados',
  'prensa': 'Prensa / Informe Semanal',
  'dolar-futuro': 'Dólar Futuro',
}

// access_level por categoría, espejo de CATEGORY_POLICY de boston-ar.
// 000 = público, 001 = premium, 002 = premium+.
export const CATEGORY_POLICY: Record<Category, string> = {
  'renta-fija': '001',
  'instrumento-del-dia': '000',
  'renta-variable': '001',
  'opciones': '001',
  'earnings': '001',
  'trade-idea': '001',
  'valor-razonable': '001',
  'valor-razonable-extendido': '002',
  'analisis-fundamental': '002',
  'macroeconomicos': '000',
  'sectoriales': '001',
  'cer': '000',
  'lecaps': '000',
  'derivados': '001',
  'prensa': '000',
  'dolar-futuro': '001',
}

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
}
