const DEFAULT_REPLY_DELETE_DELAY = 15000;

// Usuwa odpowiedź bota po krótkim czasie, żeby kanał zgłoszeń był czytelny.
function deleteReplyAfterDelay(reply, delay = DEFAULT_REPLY_DELETE_DELAY) {
    setTimeout(() => {
        reply.delete().catch(() => {});
    }, delay);
}

// Wysyła krótką odpowiedź do użytkownika i usuwa ją po podanym czasie.
async function replyTemporarily(message, payload, delay = DEFAULT_REPLY_DELETE_DELAY) {
    const reply = await message.reply(payload);

    deleteReplyAfterDelay(reply, delay);
}

module.exports = {
    replyTemporarily
};
