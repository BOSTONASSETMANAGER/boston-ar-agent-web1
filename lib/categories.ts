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
  'estrategia-rotacion',
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
  'estrategia-rotacion': 'Estrategia de Rotación',
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
  'estrategia-rotacion': '000',
}

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
}

// Lista canónica de autores del equipo de research. Mantener en sync con
// `boston-ar/supabase/migrations/009_post_authors.sql` y con cualquier UI
// que muestre el crédito al pie del informe.
export const AUTHORS = [
  'Gonzalo Gamba',
  'Ruben Dario Quispe Villanueva',
  'Stefano Roatta',
  'Equipo de Boston Asset Manager',
] as const

export type Author = typeof AUTHORS[number]

// Autor por defecto por categoría — el editor puede overridearlo en la UI
// antes de publicar.
export const AUTHOR_BY_CATEGORY: Record<Category, Author> = {
  'instrumento-del-dia': 'Gonzalo Gamba',
  'renta-variable': 'Gonzalo Gamba',
  'macroeconomicos': 'Gonzalo Gamba',
  'trade-idea': 'Gonzalo Gamba',
  'sectoriales': 'Gonzalo Gamba',
  'earnings': 'Gonzalo Gamba',
  'opciones': 'Ruben Dario Quispe Villanueva',
  'derivados': 'Ruben Dario Quispe Villanueva',
  'dolar-futuro': 'Ruben Dario Quispe Villanueva',
  'renta-fija': 'Stefano Roatta',
  'lecaps': 'Stefano Roatta',
  'cer': 'Stefano Roatta',
  'valor-razonable': 'Stefano Roatta',
  'valor-razonable-extendido': 'Stefano Roatta',
  'analisis-fundamental': 'Stefano Roatta',
  'prensa': 'Equipo de Boston Asset Manager',
  'estrategia-rotacion': 'Stefano Roatta',
}

export function getDefaultAuthor(category: Category): Author {
  return AUTHOR_BY_CATEGORY[category]
}
