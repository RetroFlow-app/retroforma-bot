const SHOP_CATEGORIES = [
    {
        id: "all",
        name: "Wszystkie",
        description: "Cała aktualna oferta RetroForma."
    },
    {
        id: "personalizacja",
        name: "Personalizacja",
        description: "Elementy wyglądu profilu i przyszłego ekwipunku."
    },
    {
        id: "tytuly",
        name: "Tytuły",
        description: "Kosmetyczne tytuły pod przyszły profil kadeta."
    },
    {
        id: "gadzety",
        name: "Gadżety",
        description: "Kolekcjonerskie drobiazgi w klimacie RetroForma."
    }
];

const INITIAL_SHOP_ITEMS = [
    {
        code: "ramka-neon",
        name: "Ramka Neon",
        description: "Świetlista ramka profilu inspirowana nocnymi szyldami retrofuturystycznych miast.",
        category: "personalizacja",
        price: 500,
        rarity: "Rzadka"
    },
    {
        code: "tlo-syntetyczny-zachod",
        name: "Tło Syntetyczny Zachód",
        description: "Ciepłe tło profilu z cyfrowym horyzontem i klimatem spokojnej eksploracji.",
        category: "personalizacja",
        price: 650,
        rarity: "Epicka"
    },
    {
        code: "motyw-crt",
        name: "Motyw CRT",
        description: "Subtelny filtr starego monitora, przygotowany pod przyszłe warianty kart profilu.",
        category: "personalizacja",
        price: 420,
        rarity: "Niepospolita"
    },
    {
        code: "emblemat-explorer",
        name: "Emblemat Explorer",
        description: "Znak odkrywcy dla kadetów, którzy lubią szukać własnych ścieżek.",
        category: "personalizacja",
        price: 360,
        rarity: "Niepospolita"
    },
    {
        code: "tytul-odkrywca",
        name: "Odkrywca",
        description: "Tytuł dla osób, które regularnie sprawdzają nowe zadania i pomysły.",
        category: "tytuly",
        price: 300,
        rarity: "Podstawowa"
    },
    {
        code: "tytul-archiwista",
        name: "Archiwista",
        description: "Tytuł dla tych, którzy cenią porządek, katalogi i dobrą dokumentację.",
        category: "tytuly",
        price: 340,
        rarity: "Niepospolita"
    },
    {
        code: "tytul-operator-sygnalu",
        name: "Operator Sygnału",
        description: "Tytuł dla kadetów łapiących inspirację nawet z bardzo słabego sygnału.",
        category: "tytuly",
        price: 460,
        rarity: "Rzadka"
    },
    {
        code: "tytul-weteran-poligonu",
        name: "Weteran Poligonu",
        description: "Tytuł dla stałych uczestników, którzy wracają do wyzwań z uporem i stylem.",
        category: "tytuly",
        price: 800,
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
        rarity: "Niepospolita"
    },
    {
        code: "aparat-polaroid",
        name: "Aparat Polaroid",
        description: "Pamiątkowy aparat do łapania krótkich momentów między kolejnymi misjami.",
        category: "gadzety",
        price: 520,
        rarity: "Rzadka"
    },
    {
        code: "terminal-przenosny",
        name: "Terminal Przenośny",
        description: "Kieszonkowy terminal do przyszłych wypraw, notatek i sygnałów z Poligonu.",
        category: "gadzety",
        price: 700,
        rarity: "Epicka"
    }
];

module.exports = {
    INITIAL_SHOP_ITEMS,
    SHOP_CATEGORIES
};
