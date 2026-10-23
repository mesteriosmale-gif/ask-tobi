# AI — Liquid Sculpture

A full-screen, fire-toned liquid particle sculpture with a Gemini-powered chat assistant. Gemini generates conversation-driven particle colors, wave frequency, speed, size, and turbulence; the sculpture smoothly morphs while continuing to track the pointer. The assistant also includes a head-tracked anime avatar with click reactions.

## Setup

1. Use Node.js 20.9 or newer.
2. Run `npm install`.
3. Create a Gemini API key in Google AI Studio.
4. Add the new key to the root `.env.local`:

   ```env
   GEMINI_API_KEY=your_rotated_key_here
   SITE_URL=https://your-domain.com
   ```

   `SITE_URL` should be the final public HTTPS origin. It is used for canonical URLs,
   the sitemap, and social metadata. Vercel's production domain is detected automatically
   when this variable is omitted.

5. Run `npm run dev` and open the local URL shown in the terminal.

The avatar model is loaded from `public/models/elaina.glb` when the chat opens. Keep this model asset in place for local and production deployments.

The Gemini key is read only by `app/api/chat/route.ts`; it is never sent to the browser. Do not commit `.env.local` or share the key. If a key has been posted or exposed, revoke it and create a replacement.

## Authentication setup

The chat requires a signed-in account. Users and Google OAuth accounts are stored in
MongoDB Atlas through the Auth.js MongoDB adapter. Email/password accounts and chat
history use Mongoose models; passwords are hashed with bcrypt before they are saved.
Google sign-in only accepts profiles with a verified email address.

1. Create a MongoDB Atlas cluster and database user. Add your development and production
   server IPs to the Atlas network access list.
2. Put the Atlas connection string in `.env.local` as `MONGODB_URI`. Include a database
   name in the URI; the app creates its `users`, `accounts`, and `chats` collections
   automatically on first use.
3. Generate a session secret, for example with `openssl rand -base64 32`, and set it
   as `AUTH_SECRET`.
4. To enable Google sign-in, create a Google OAuth Web application and add
   `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` to `.env.local`. Add
   `http://localhost:3000/api/auth/callback/google` as a local authorized redirect URI;
   add `https://your-domain.com/api/auth/callback/google` for production.
5. Set `AUTH_TRUST_HOST=true` when self-hosting behind a trusted reverse proxy. Vercel
   deployments are detected automatically.
6. Restart the app. For production, configure the same variables in the hosting
   provider's encrypted environment settings.

The registration form requires a 12-character password. Google login is shown only
when the MongoDB URI and both Google OAuth variables are configured. The chat API
independently checks the server-side session, and each saved exchange is associated
with its authenticated user. On sign-in, the latest 100 saved exchanges are loaded
into the chat. The MongoDB adapter and Mongoose share the `MONGODB_URI` database.

## Commands

- `npm run dev` — start the Next.js development server.
- `npm run lint` — lint the app.
- `npm run build` — type-check and create a production build.
- `npm start` — start the production server after building.

## Support

Use the Contact button to open the animated support guide. The chat endpoint limits message size and recent history and applies a basic per-address request limit.

## Search visibility

The app publishes `/robots.txt`, `/sitemap.xml`, page metadata, and a generated social
preview image. Production indexing is enabled for production deployments; development
and Vercel preview deployments are marked noindex. After connecting a production domain,
submit `https://your-domain.com/sitemap.xml` in Google Search Console and Bing Webmaster
Tools. Search indexing and ranking take time and cannot be guaranteed.
