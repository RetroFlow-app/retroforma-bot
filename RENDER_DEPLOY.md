# RetroBot deploy on Render

Use this project as a `Background Worker`.

## Build

- Build Command: `npm ci`
- Start Command: `bash ./render-start.sh`

## Environment Variables

- `DISCORD_TOKEN` = new Discord bot token

## Persistent Disk

Add a persistent disk with mount path:

`/var/data/retrobot`

This keeps:

- `database.db`
- `src/database/system.json`

## Important

Do not commit the real `.env` file.
Reset the Discord token before deploying if the old one was exposed.
