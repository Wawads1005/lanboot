import e from "express";
import apiRouter from "@/routes/api";

const appRouter = e.Router();

appRouter.use("/api", apiRouter);

export default appRouter;
