package pe.edu.upc.viasegura.moderacion.domain;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Groserias en un texto que se va a publicar (NC-10b, D-15, propuesta
 * {@code 2026-10-28-moderacion-de-contenido.md} §5): una regla pura, sin I/O,
 * sobre una lista propia y versionada que lee al arrancar
 * {@code moderacion/infra/ListaDeGroseriasConfig}.
 *
 * <p><b>Normalizacion.</b> Cada texto pasa por estos pasos:</p>
 * <ol>
 *   <li>NFKC, sin caracteres de formato (un espacio de ancho cero no corta una
 *       palabra) y en minusculas ({@link Locale#ROOT}).</li>
 *   <li>Sin tildes ni dieresis, <b>pero la ñ se conserva</b>: si no, «año»
 *       pasaria a «ano» y «coño» a «cono», que es una palabra legitima en un
 *       reporte vial.</li>
 *   <li><i>Leetspeak</i>, solo dentro de tokens con al menos una letra:
 *       0→o, 3→e, 4→a, 5→s, 7→t, @→a, $→s, y el 1 se prueba como i y como l. Un
 *       numero suelto («km 15», «2026») no cambia.</li>
 *   <li>Comodin: {@code *} o {@code #} <b>dentro</b> de una palabra valen por
 *       una letra cualquiera («p*ta»). Al borde se descartan («**ojo**»), y
 *       solo valen si la palabra tiene mas letras que comodines.</li>
 *   <li>Tokens: se corta por todo lo que no es letra (la ñ cuenta como
 *       letra). Tres o mas tokens de una sola letra seguidos se unen
 *       («p u t a», «p.u.t.a»).</li>
 *   <li>Letras repetidas: cada token se compara en dos formas, con las rachas
 *       de 3 o mas letras iguales reducidas a 2 y reducidas a 1. «putaaa» da
 *       «putaa» y «puta». Las entradas de la lista <b>no</b> se reducen, asi
 *       que «pera» no coincide con «perrrra» reducida a 2 («perra»).</li>
 *   <li>Coincidencia por <b>token entero</b>, o por una secuencia de 2 a 4
 *       tokens para las expresiones («concha de tu madre»). <b>Nunca por
 *       subcadena</b>: «vehiculo», «obstaculo», «pelicula» o «disputa» no
 *       coinciden con nada (el problema de Scunthorpe).</li>
 * </ol>
 *
 * <p><b>El archivo.</b> Una entrada por linea, ya normalizada (minusculas, sin
 * tildes salvo la ñ, solo letras y espacios simples, de 1 a 4 palabras, sin
 * rachas de 3 letras iguales). Las lineas que empiezan con {@code #} son
 * comentarios, y una de ellas tiene que ser {@code # version: <version>}. Las
 * entradas se vuelven a normalizar al leerlas; la guarda
 * {@code ListaDeGroseriasTest} exige que el archivo ya venga normalizado y sin
 * duplicados.</p>
 */
public final class FiltroDeGroserias {

    /** Prefijo de la linea de comentario con la version de la lista. */
    public static final String PREFIJO_VERSION = "version:";

    /** Una expresion tiene a lo sumo este numero de palabras. */
    public static final int MAX_PALABRAS_POR_EXPRESION = 4;

    /** Una entrada valida, ya normalizada: de 1 a 4 palabras de letras minusculas, sin tildes salvo la ñ. */
    private static final Pattern ENTRADA = Pattern.compile("[a-zñ]+( [a-zñ]+){0,3}");
    /** Tres o mas letras iguales seguidas. */
    private static final Pattern RACHA_LARGA = Pattern.compile("(\\p{L})\\1\\1");

    /** Marca interna de un comodin dentro de un token. */
    private static final char COMODIN = '?';
    /** Marca interna de un 1 dentro de un token: se prueba como i y como l. */
    private static final char UNO = '!';
    /** Con mas unos que esto en un token, solo se prueban «todos i» y «todos l». */
    private static final int MAX_UNOS_COMBINADOS = 3;

    private final String version;
    private final Set<String> palabras;
    private final Map<Integer, List<String>> palabrasPorLargo;
    private final List<List<String>> expresiones;

    private FiltroDeGroserias(String version, Set<String> palabras, List<List<String>> expresiones) {
        this.version = version;
        this.palabras = Set.copyOf(palabras);
        Map<Integer, List<String>> porLargo = new HashMap<>();
        for (String palabra : palabras) {
            porLargo.computeIfAbsent(palabra.length(), largo -> new ArrayList<>()).add(palabra);
        }
        this.palabrasPorLargo = Map.copyOf(porLargo);
        this.expresiones = List.copyOf(expresiones);
    }

    /**
     * Arma el filtro desde las lineas del archivo.
     *
     * @throws IllegalArgumentException si falta la linea de version o una
     *         entrada no es valida (dice cual), para que la aplicacion no
     *         arranque con una lista que no hace lo que dice
     */
    public static FiltroDeGroserias desdeLineas(Collection<String> lineas) {
        String version = null;
        Set<String> palabras = new LinkedHashSet<>();
        List<List<String>> expresiones = new ArrayList<>();
        Set<String> expresionesVistas = new HashSet<>();
        int numero = 0;
        for (String linea : lineas) {
            numero++;
            String limpia = linea.strip();
            if (limpia.isEmpty()) {
                continue;
            }
            if (limpia.startsWith("#")) {
                String comentario = limpia.substring(1).strip();
                if (comentario.toLowerCase(Locale.ROOT).startsWith(PREFIJO_VERSION)) {
                    version = comentario.substring(PREFIJO_VERSION.length()).strip();
                }
                continue;
            }
            String entrada = normalizarEntrada(limpia);
            if (!esEntradaValida(entrada)) {
                throw new IllegalArgumentException("Linea " + numero + " de la lista de groserias: la entrada no es"
                        + " valida (solo letras y espacios, de 1 a " + MAX_PALABRAS_POR_EXPRESION
                        + " palabras, sin tres letras iguales seguidas)");
            }
            if (entrada.contains(" ")) {
                if (expresionesVistas.add(entrada)) {
                    expresiones.add(List.of(entrada.split(" ")));
                }
            } else {
                palabras.add(entrada);
            }
        }
        if (version == null || version.isBlank()) {
            throw new IllegalArgumentException("La lista de groserias no tiene la linea «# " + PREFIJO_VERSION
                    + " <version>»");
        }
        return new FiltroDeGroserias(version, palabras, expresiones);
    }

    /** La version de la lista ({@code # version: ...}), que va en el log de cada rechazo. */
    public String version() {
        return version;
    }

    /** Cuantas entradas tiene: palabras y expresiones. */
    public int tamano() {
        return palabras.size() + expresiones.size();
    }

    /**
     * La entrada de la lista que coincide con el texto, si hay alguna. Es para
     * el log: nunca se le muestra al ciudadano.
     */
    public Optional<String> coincidencia(String texto) {
        if (texto == null || texto.isBlank()) {
            return Optional.empty();
        }
        List<Set<String>> formas = tokens(texto).stream().map(FiltroDeGroserias::formas).toList();
        for (Set<String> formasDelToken : formas) {
            for (String forma : formasDelToken) {
                Optional<String> palabra = palabraQueCoincide(forma);
                if (palabra.isPresent()) {
                    return palabra;
                }
            }
        }
        for (List<String> expresion : expresiones) {
            for (int inicio = 0; inicio + expresion.size() <= formas.size(); inicio++) {
                if (coincideDesde(formas, inicio, expresion)) {
                    return Optional.of(String.join(" ", expresion));
                }
            }
        }
        return Optional.empty();
    }

    /** Si el texto tiene alguna groseria de la lista. */
    public boolean tieneGroseria(String texto) {
        return coincidencia(texto).isPresent();
    }

    // --- Normalizacion ---------------------------------------------------------

    /**
     * Como queda una entrada del archivo: los pasos 1 y 2 de la normalizacion
     * (NFKC, minusculas, sin tildes salvo la ñ), sin espacios al borde y con
     * espacios simples entre palabras. No reduce las letras repetidas ni
     * traduce el <i>leetspeak</i>.
     */
    public static String normalizarEntrada(String entrada) {
        return normalizarTexto(entrada).strip().replaceAll("\\s+", " ");
    }

    /** Si la entrada ya normalizada tiene la forma que admite la lista. */
    public static boolean esEntradaValida(String entrada) {
        return entrada != null && ENTRADA.matcher(entrada).matches() && !RACHA_LARGA.matcher(entrada).find();
    }

    /** Pasos 1 y 2: NFKC, sin caracteres de formato, minusculas y sin tildes ni dieresis, salvo la ñ. */
    static String normalizarTexto(String texto) {
        String compuesto = Normalizer.normalize(texto, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        StringBuilder salida = new StringBuilder(compuesto.length());
        compuesto.codePoints().forEach(cp -> {
            if (Character.getType(cp) == Character.FORMAT) {
                return;
            }
            if (cp == 'ñ') {
                salida.append('ñ');
                return;
            }
            Normalizer.normalize(new String(Character.toChars(cp)), Normalizer.Form.NFD).codePoints()
                    .filter(c -> !esMarca(c))
                    .forEach(salida::appendCodePoint);
        });
        return salida.toString();
    }

    private static boolean esMarca(int cp) {
        int tipo = Character.getType(cp);
        return tipo == Character.NON_SPACING_MARK || tipo == Character.ENCLOSING_MARK
                || tipo == Character.COMBINING_SPACING_MARK;
    }

    /**
     * Pasos 3 a 5: los tokens del texto, con el <i>leetspeak</i> traducido, los
     * comodines marcados con {@value #COMODIN} y los unos con {@value #UNO}
     * (todavia sin decidir si son i o l).
     */
    static List<String> tokens(String texto) {
        String normalizado = normalizarTexto(texto);
        List<String> tokens = new ArrayList<>();
        StringBuilder crudo = new StringBuilder();
        for (int i = 0; i < normalizado.length(); i++) {
            char c = normalizado.charAt(i);
            if (Character.isLetterOrDigit(c) || c == '@' || c == '$' || c == '*' || c == '#') {
                crudo.append(c);
            } else {
                agregarTokens(crudo, tokens);
            }
        }
        agregarTokens(crudo, tokens);
        return unirLetrasSueltas(tokens);
    }

    /** Un token crudo (letras, digitos y simbolos) pasa a uno o mas tokens. Vacia {@code crudo}. */
    private static void agregarTokens(StringBuilder crudo, List<String> tokens) {
        if (crudo.isEmpty()) {
            return;
        }
        String texto = crudo.toString();
        crudo.setLength(0);
        if (texto.chars().noneMatch(Character::isLetter)) {
            return; // un numero o un simbolo suelto no cambia ni cuenta
        }
        StringBuilder traducido = new StringBuilder(texto.length());
        for (int i = 0; i < texto.length(); i++) {
            traducido.append(traducir(texto.charAt(i)));
        }
        for (String parte : traducido.toString().split(" ")) {
            String sinComodinesAlBorde = quitarComodinesAlBorde(parte);
            // Como el token crudo: sin una letra de verdad, no cuenta.
            if (sinComodinesAlBorde.chars().anyMatch(Character::isLetter)) {
                tokens.add(sinComodinesAlBorde);
            }
        }
    }

    /** El <i>leetspeak</i> y los comodines; un digito sin equivalente corta el token (un espacio). */
    private static char traducir(char c) {
        return switch (c) {
            case '0' -> 'o';
            case '3' -> 'e';
            case '4', '@' -> 'a';
            case '5', '$' -> 's';
            case '7' -> 't';
            case '1' -> UNO;
            case '*', '#' -> COMODIN;
            default -> Character.isLetter(c) ? c : ' ';
        };
    }

    private static String quitarComodinesAlBorde(String parte) {
        int inicio = 0;
        int fin = parte.length();
        while (inicio < fin && parte.charAt(inicio) == COMODIN) {
            inicio++;
        }
        while (fin > inicio && parte.charAt(fin - 1) == COMODIN) {
            fin--;
        }
        return parte.substring(inicio, fin);
    }

    /** Paso 5: tres o mas tokens de una sola letra seguidos se unen en uno («p u t a»). */
    private static List<String> unirLetrasSueltas(List<String> tokens) {
        List<String> unidos = new ArrayList<>(tokens.size());
        int i = 0;
        while (i < tokens.size()) {
            int fin = i;
            while (fin < tokens.size() && tokens.get(fin).length() == 1) {
                fin++;
            }
            if (fin - i >= 3) {
                unidos.add(String.join("", tokens.subList(i, fin)));
                i = fin;
            } else {
                unidos.add(tokens.get(i));
                i++;
            }
        }
        return unidos;
    }

    /**
     * Paso 6: las formas con que se compara un token. Cada 1 se prueba como i y
     * como l, y cada resultado con las rachas de 3 o mas letras reducidas a 2 y
     * a 1.
     */
    static Set<String> formas(String token) {
        Set<String> formas = new LinkedHashSet<>();
        for (String sinUnos : unosComoIoL(token)) {
            formas.add(reducirRachas(sinUnos, 2));
            formas.add(reducirRachas(sinUnos, 1));
        }
        return formas;
    }

    private static List<String> unosComoIoL(String token) {
        int unos = (int) token.chars().filter(c -> c == UNO).count();
        if (unos == 0) {
            return List.of(token);
        }
        if (unos > MAX_UNOS_COMBINADOS) {
            return List.of(token.replace(UNO, 'i'), token.replace(UNO, 'l'));
        }
        List<String> variantes = new ArrayList<>(List.of(""));
        for (int i = 0; i < token.length(); i++) {
            char c = token.charAt(i);
            List<String> siguientes = new ArrayList<>(variantes.size() * 2);
            for (String previa : variantes) {
                if (c == UNO) {
                    siguientes.add(previa + 'i');
                    siguientes.add(previa + 'l');
                } else {
                    siguientes.add(previa + c);
                }
            }
            variantes = siguientes;
        }
        return variantes;
    }

    /** Cada racha de 3 o mas letras iguales queda en {@code largo} letras; los comodines no se reducen. */
    private static String reducirRachas(String token, int largo) {
        StringBuilder salida = new StringBuilder(token.length());
        int i = 0;
        while (i < token.length()) {
            char c = token.charAt(i);
            int fin = i;
            while (fin < token.length() && token.charAt(fin) == c) {
                fin++;
            }
            int racha = fin - i;
            int conservar = (racha >= 3 && c != COMODIN) ? largo : racha;
            salida.append(String.valueOf(c).repeat(conservar));
            i = fin;
        }
        return salida.toString();
    }

    // --- Comparacion -------------------------------------------------------------

    private Optional<String> palabraQueCoincide(String forma) {
        if (forma.indexOf(COMODIN) < 0) {
            return palabras.contains(forma) ? Optional.of(forma) : Optional.empty();
        }
        if (!comodinesAdmitidos(forma)) {
            return Optional.empty();
        }
        for (String palabra : palabrasPorLargo.getOrDefault(forma.length(), List.of())) {
            if (coincideConComodines(forma, palabra)) {
                return Optional.of(palabra);
            }
        }
        return Optional.empty();
    }

    private static boolean coincideDesde(List<Set<String>> formas, int inicio, List<String> expresion) {
        for (int j = 0; j < expresion.size(); j++) {
            String palabra = expresion.get(j);
            boolean alguna = false;
            for (String forma : formas.get(inicio + j)) {
                if (forma.equals(palabra) || (comodinesAdmitidos(forma) && coincideConComodines(forma, palabra))) {
                    alguna = true;
                    break;
                }
            }
            if (!alguna) {
                return false;
            }
        }
        return true;
    }

    /** Un comodin solo vale si la palabra tiene mas letras que comodines: «p**a» no es nada. */
    private static boolean comodinesAdmitidos(String forma) {
        long comodines = forma.chars().filter(c -> c == COMODIN).count();
        return comodines > 0 && forma.length() - comodines > comodines;
    }

    private static boolean coincideConComodines(String forma, String palabra) {
        if (forma.length() != palabra.length()) {
            return false;
        }
        for (int i = 0; i < forma.length(); i++) {
            char c = forma.charAt(i);
            if (c != COMODIN && c != palabra.charAt(i)) {
                return false;
            }
        }
        return true;
    }
}
