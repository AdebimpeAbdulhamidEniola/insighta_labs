import { createApp } from "./config/app.config.js";
import dotenv from "dotenv";

dotenv.config();

const app = createApp();

// Only start the server locally — Vercel handles the server in production
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

export default app;