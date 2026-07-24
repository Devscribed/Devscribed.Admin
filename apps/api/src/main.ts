import { createApp } from './bootstrap';

/** Long-running entry point: local `npm run dev` and the Playwright web server. */
async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(Number(process.env.PORT) || 4000);
}

void bootstrap();
