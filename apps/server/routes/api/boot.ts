import bootHandler from "@/controllers/boot";
import e from "express";

const bootRouter = e.Router();

bootRouter.use("/", bootHandler);

export default bootRouter;
