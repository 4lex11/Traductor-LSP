// Categorías de navegación según la glosa que muestra el catálogo.
// Las entradas nuevas quedan en «Otras señas» hasta que se revisen.
const groups = [
  ['Abecedario', 'a|b|c|d|e|f|g|h|i|j|k|l|m|n|ñ|o|p|q|r|s|t|u|v|w|x|y|z'],
  ['Números, cantidades y dinero', 'algunos|bastante|catorce|cien|cincuenta|cuanto|cuantos|cuarenta|cuatro|diecinueve|dieciocho|dieciseis|diecisiete|diez|dinero|dinero - plata|doce|dos|mucho|mucho-dinero|nada|nada más|nueve|poco|rollo-de-monedas|tres|uno'],
  ['Acciones', 'abrazar|abrir|abrir-cajón|abrir-cortina|abrir-objeto-plano-vertical|abrir-por-las-asas|abrir-puerta|abrir-ventana|abrir-vertical-objeto|acercarse|acordar|agarrar-botella|agarrar-ropa|agrupar|alejar-de-la persona|asomar|atrapar|avisar|ayudar|bailar|bajar-escalera|barrer|buscar|buscar-recipente|caer|caer-escalera|cambiar|cambiar-ropa|caminar|caminar-ave|caminar-elefante|caminar-perro|caminar-persona|captar|cargar|cargar-caja|cargar-mochila|casar|casarse|cerrar-cajon|cerrar-cajón|cerrar-cierre|chocar|colocar-botella|comer|comer-manzana|comprar|comunicar|conducir|contar|contar -billetes|contar billetes|contar-billetes|contar-manual|conversar|correr|cruzar-avion|cruzar-bicicleta|cruzar-bote|cruzar-el-cielo|dar|dar-la-espalda|dar-pasos|deber|decir|demostrar|desaparecer|desear|desenrroscar-tapa|desparecer|detener - parar|dibujar|doblar|dormir|echar-cucharada|empezar|empujar|encender-motor|encontrar|encontrarse|engañar|engordar|enrroscar/cerrar-tapa|enseñar|entender|entender - comprender|entrar|entrar-persona|entregar|entrenar|enviar|esconder|escribir|esperar|estudiar|faltar|fastidiar|firmar|fundar|grabar|grabar_1|graduarse|guardar|gustar|haber|hacer|incomodar|ingresar|intentar|interactuar|invitar|ir|jalar-cordon|jugar|leer|levantar-tapa|limpiar|llamar|llamar-la-atencion|llegar|llevar|llevar-recipente|mandar|mezclar|necesitar|no-captar|no-haber|no-importar|no-saber|odiar|pagar|participar|pasar-ave|pensar|perder|poder|poner|preguntar|proteger|querer|quitar|refrescar|robar|romper|saber|sacar|sentar|sentir|señar|sonar-telefono|sostener|subir-persona|sudar|sudar-mucho|terminar|tipear|tirar|trabajar|traer-caja|tropezar|vender|venir|ver|ver_1|vestir|viajar|visitar'],
  ['Personas y familia', 'abuelo|amigo|bombero|contricantes|conyuge|doctor|dos-personas|grupo|hijo|hombre|jefe|joven|juan|mama|mama_1|mamá|mujer|niño|persona|persona-pequeña|personas|personas-juntas|policia|sobrina|sordo|tia|viejo'],
  ['Saludos y expresiones', 'adivina|ah-ya|atencion|beso|bien|bien/mejor|bien_3|casualidad|chau|como|cual|cuando|cuidado|dame|de-acuerdo|disculpa|donde|estar-bien|hola|idea|idea_2|lo-siento|no|oye|pero|por favor|por-favor|prestarme|que|quien|qué|uy|vamos|ven|wow|ya|ya-ver|¿qué-pasa?'],
  ['Pronombres y posesivos', 'ellos|esos|mi|su|tu|yo'],
  ['Tiempo y clima', 'ahora|amanecer|anochecer|antes|atardecer|año|baja-temperatura|caliente|calor|despues|dia|edad|fin|frio|futuro|hora|hoy|luego|mañana|mañana-del-dia|mucho-sol|mucho-tiempo|pasado|presente|sabado|siempre|sol|sol_1|tarde|temprano|tiempo|toda-la-noche'],
  ['Lugares y transporte', 'ahi|al-frente|alla|avion|baño|bicicleta|bote|bus|calle|camioneta|carro|casa|ciudad|colegio|combi|debajo|dentro|esquina|helicoptero_1|hospital|huaraz|iglesia|lugar|mar|mundo|oficina|pais|peru|playa|universidad|via-doble-sentido|viaje'],
  ['Animales y alimentos', 'animal|arroz chaufa|ave|chancho|dinosaurio|gallina|gato|helado|huevo|mono|pan|papa|pato|perro|pez|pollo|vino'],
  ['Objetos y ropa', 'anillo|arete|bola-de-cristal|bolsillo|caja|caja-grande|caja-pequeña|cama|camarote|cartas-de-tarot|casaca|celular|cortina|cortina-roller|cuna|gorro|gorro_1|lentes|libro|llave|luz|manguera|mochila|motor|paquete|pelota|persiana|pila|polo|reloj|ropa|silla|sirena|telefono|televisión|zapato'],
  ['Cuerpo y salud', 'cuerpo|echado|embarazo|enfermo (lsp) // enfermo|flaco|fortachon|gordo|ojos|sick|vida'],
  ['Educación, deporte y eventos', 'clase|cumpleaños|deporte|examen|fiesta|futbol|historia|matematica|matrimonio|primero-de-primaria'],
  ['Cualidades y emociones', 'alto|aburrido|bonito|brillo|bueno|curiosidad|diferente|dificil|enamorado|facil|feliz|fino|fregado|fregrado|fuerte|grande|hermosa|igual|igual_5|imposible|increible|infiel|lento|libre|lindo|malo|mejor|misio|muy-alto|ocupado|oscuro|pequeño|rico|solo|sorpresa|sucio'],
] as const

const otherCategory = 'Otras señas'
export const dictionaryCategories = [...groups.map(([category]) => category), otherCategory]
export type DictionaryCategory = (typeof dictionaryCategories)[number]

const categoriesByGloss = new Map<string, DictionaryCategory>(
  groups.flatMap(([category, glosses]) => glosses.split('|').map(gloss => [gloss, category] as const)),
)

export function dictionaryCategory(gloss: string): DictionaryCategory {
  return categoriesByGloss.get(gloss.trim().normalize('NFC').toLocaleLowerCase('es')) ?? otherCategory
}

export function dictionarySearchText(text: string): string {
  return text.toLocaleLowerCase('es').normalize('NFD')
    .replace(/([aeiou])[\u0300-\u0308]/g, '$1')
    .normalize('NFC').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
}
