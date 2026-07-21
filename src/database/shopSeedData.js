const SHOP_CATEGORIES = [
    {
        id: "all",
        name: "Wszystkie",
        description: "Cała aktualna oferta RetroForma."
    },
    {
        id: "ramki",
        name: "Ramki",
        description: "Ramki profilu do przyszlej personalizacji karty kadeta."
    },
    {
        id: "motywy-profilu",
        name: "Motywy profilu",
        description: "Tla i motywy profilu do przyszlej karty kadeta."
    },
    {
        id: "gadzety",
        name: "Gadżety",
        description: "Kolekcjonerskie drobiazgi w klimacie RetroForma."
    }
];

// Te pozycje nie sa juz sprzedawane za PP. Odznaki i tytuly beda zdobywane za osiagniecia.
const REMOVED_SHOP_ITEM_CODES = [
    "emblemat-explorer",
    "tytul-odkrywca",
    "tytul-archiwista",
    "tytul-operator-sygnalu",
    "tytul-weteran-poligonu"
];

const FRAME_SHOP_ITEM_CODES = [
    "ramka-carbon",
    "ramka-neon",
    "ramka-cyan",
    "ramka-amber"
];

const BACKGROUND_SHOP_ITEM_CODES = [
    "motyw-crt",
    "tlo-syntetyczny-zachod",
    "tlo-blueprint",
    "tlo-aurora",
    "tlo-storm",
    "tlo-satellite-array"
];

const INITIAL_SHOP_ITEMS = [
    {
        code: "ramka-carbon",
        name: "Ramka Carbon",
        description: "Matowa ramka profilu z technicznym wzorem karbonu i spokojnym kontrastem.",
        category: "ramki",
        price: 360,
        rarity: "Podstawowa"
    },
    {
        code: "ramka-neon",
        name: "Ramka Neon",
        description: "Świetlista ramka profilu inspirowana nocnymi szyldami retrofuturystycznych miast.",
        category: "ramki",
        price: 500,
        rarity: "Podstawowa"
    },
    {
        code: "ramka-cyan",
        name: "Ramka Cyan",
        description: "Chlodna ramka profilu z cyfrowym akcentem i czytelnym swiatlem krawedzi.",
        category: "ramki",
        price: 680,
        rarity: "Epicka"
    },
    {
        code: "ramka-amber",
        name: "Ramka Amber",
        description: "Bursztynowa ramka profilu z cieplym obrysem i eleganckim pulsem RetroForma.",
        category: "ramki",
        price: 900,
        rarity: "Epicka"
    },
    {
        code: "tlo-syntetyczny-zachod",
        name: "Tło Syntetyczny Zachód",
        description: "Ciepłe tło profilu z cyfrowym horyzontem i klimatem spokojnej eksploracji.",
        category: "motywy-profilu",
        price: 650,
        rarity: "Epicka"
    },
    {
        code: "motyw-crt",
        name: "Motyw CRT",
        description: "Subtelny filtr starego monitora, przygotowany pod przyszłe warianty kart profilu.",
        category: "motywy-profilu",
        price: 420,
        rarity: "Podstawowa"
    },
    {
        code: "tlo-blueprint",
        name: "Tło Blueprint",
        description: "Techniczne tło profilu z rysunkiem konstrukcyjnym i chłodnym światłem CAD.",
        category: "motywy-profilu",
        price: 360,
        rarity: "Podstawowa"
    },
    {
        code: "tlo-aurora",
        name: "Tło Aurora",
        description: "Nastrojowe tło profilu z miękką poświatą i spokojnym futurystycznym kolorem.",
        category: "motywy-profilu",
        price: 520,
        rarity: "Podstawowa"
    },
    {
        code: "tlo-storm",
        name: "Tło Storm",
        description: "Ciemne tło profilu z dynamicznym światłem i energią nadciągającego frontu.",
        category: "motywy-profilu",
        price: 720,
        rarity: "Epicka"
    },
    {
        code: "tlo-satellite-array",
        name: "Tło Satellite Array",
        description: "Profilowe tło inspirowane antenami, sygnałem i nocną pracą operatora.",
        category: "motywy-profilu",
        price: 900,
        rarity: "Epicka"
    },
    {
        code: "kompas-analogowy",
        name: "Kompas Analogowy",
        description: "Kolekcjonerski gadżet dla tych, którzy nawet w cyfrowym świecie lubią kierunek.",
        category: "gadzety",
        price: 260,
        rarity: "Podstawowa"
    },
    {
        code: "radio-kieszonkowe",
        name: "Radio Kieszonkowe",
        description: "Mały odbiornik pełen szumu, sygnałów i nocnych transmisji RetroForma.",
        category: "gadzety",
        price: 380,
        rarity: "Podstawowa"
    },
    {
        code: "aparat-polaroid",
        name: "Aparat Polaroid",
        description: "Pamiątkowy aparat do łapania krótkich momentów między kolejnymi misjami.",
        category: "gadzety",
        price: 520,
        rarity: "Epicka"
    },
    {
        code: "terminal",
        name: "Terminal Polowy",
        description: "Kieszonkowy terminal do przyszłych wypraw, notatek i sygnałów z Poligonu.",
        category: "gadzety",
        price: 700,
        rarity: "Epicka"
    }
];

module.exports = {
    BACKGROUND_SHOP_ITEM_CODES,
    FRAME_SHOP_ITEM_CODES,
    INITIAL_SHOP_ITEMS,
    REMOVED_SHOP_ITEM_CODES,
    SHOP_CATEGORIES
};
