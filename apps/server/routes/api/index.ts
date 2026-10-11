import e from "express";
import bootRouter from "@/routes/api/boot";

const apiRouter = e.Router();

apiRouter.use("/boot", bootRouter);

export default apiRouter;
