This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Automated Task Translation

Dynamic task content (title, description, comments, history) can now be translated on demand via `/api/translate`. By default the handler uses the free [MyMemory](https://mymemory.translated.net/doc/spec.php) API which works without an API key but has daily limits. You can provide a contact email to unlock a slightly higher quota:

```
MYMEMORY_EMAIL=alerts@example.com
MYMEMORY_FALLBACK_SOURCE=en
```

If you want to point the feature at a self-hosted LibreTranslate instance instead, switch the provider and supply the endpoint (along with an API key when required):

```
TRANSLATE_PROVIDER=libretranslate
TRANSLATE_API_URL=https://your-instance/translate
TRANSLATE_API_KEY=optional-key
```

Each language switch in the task drawer calls this endpoint and caches results in memory on the server for faster repeat lookups. When using MyMemory, the server will attempt to auto-detect the source language (currently tuned for English, Polish, German, and Slovak) and fall back to `MYMEMORY_FALLBACK_SOURCE` (defaults to `en`). Set that variable to whatever language your task data is authored in (for example `pl`) to guarantee valid `langpair` requests.
