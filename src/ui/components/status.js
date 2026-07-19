const {
    COLORS,
    drawFittedText,
    fillRoundedRect,
    setFont,
    strokeRoundedRect
} = require("../renderer");

function getStatusView(options) {
    const {
        canAfford = true,
        item = null,
        notice = null,
        owned = false
    } = options;

    if (!item) {
        return {
            color: COLORS.muted,
            detail: "Wybierz inna kategorie albo wroc pozniej.",
            label: "BRAK OFERTY"
        };
    }

    if (owned) {
        return {
            color: COLORS.blue,
            detail: notice?.type === "success" ? "Zakup zapisany." : "Juz w ekwipunku.",
            label: "POSIADASZ"
        };
    }

    if (notice?.type === "error") {
        return {
            color: COLORS.danger,
            detail: notice.lines?.join(" / ") || "Nie mozna teraz kupic przedmiotu.",
            label: notice.title || "NIEDOSTEPNY"
        };
    }

    if (!Number.isSafeInteger(Number(item.price)) || Number(item.price) < 0) {
        return {
            color: COLORS.danger,
            detail: "Ten przedmiot jest chwilowo niedostepny.",
            label: "NIEDOSTEPNY"
        };
    }

    if (!canAfford) {
        return {
            color: COLORS.danger,
            detail: `Brakuje ${Math.max(0, Number(item.price) - Number(options.playerPP || 0))} PP do zakupu.`,
            label: "ZA MALO PP"
        };
    }

    return {
        color: COLORS.green,
        detail: "Gotowy do zakupu.",
        label: "DOSTEPNY"
    };
}

function drawStatusPanel(ctx, options) {
    const {
        width = 520,
        x,
        y
    } = options;
    const status = getStatusView(options);

    fillRoundedRect(ctx, x, y, width, 66, 18, `${status.color}16`);
    strokeRoundedRect(ctx, x, y, width, 66, 18, `${status.color}88`, 1.4);
    setFont(ctx, 15, "800");
    ctx.fillStyle = status.color;
    drawFittedText(ctx, status.label.toUpperCase(), x + 20, y + 27, width - 40);
    setFont(ctx, 16, "400");
    ctx.fillStyle = COLORS.text;
    drawFittedText(ctx, status.detail, x + 20, y + 53, width - 40);
}

module.exports = {
    drawStatusPanel,
    getStatusView
};
