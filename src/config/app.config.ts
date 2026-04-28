import cors from "cors";
import express, { Application } from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import { notFoundHandler } from "../utils/notfound.utils";
import { errorHandler } from "../utils/errorhandler.utils";
import ProfileRouter from "../routes/profile.route"
import AuthRouter from "../routes/auth.route"

dotenv.config();

export const createApp = (): Application => {
  const app: Application = express();

  app.disable('x-powered-by') // Hide Express header for security

  app.use(express.json())


  //Log every request including in production
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))


  app.use(cors({ origin: "*" }));


  //Routes

  app.use("/auth", AuthRouter);
  app.use("/api/profiles", ProfileRouter)




  //Not Found Handler
  app.use(notFoundHandler)

  //Error Handler 
  app.use(errorHandler)


  return app;
};